// =====================================================================
//  Gestión y Control de Insumos · Protección Civil Venezuela
//  Lógica principal de la aplicación (Firestore)
// =====================================================================
import {
  db, auth, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, runTransaction, serverTimestamp, Timestamp,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  updatePassword, crearUsuarioAislado,
} from "./firebase-init.js";

const UMBRAL_CRITICO_DEFECTO = 100;

// Código que se exige para crear nuevos usuarios. Cámbialo por el de tu institución.
const CODIGO_REGISTRO = "PCVE-2026";
// Dominio interno: el "usuario" se convierte en usuario@DOMINIO para Firebase Auth.
const DOMINIO_AUTH = "modulopc.app";
const emailDeUsuario = (u) => u.trim().toLowerCase().replace(/\s+/g, "") + "@" + DOMINIO_AUTH;
const usuarioDeEmail = (e) => (e || "").split("@")[0];

// Estado en memoria (sincronizado en tiempo real con Firestore)
let productos = [];        // [{id, nombre, categoria, unidad, cantidad, conteoInicial, minimo, ubicacion}]
let movimientos = [];      // [{id, tipo, referencia, productoId, productoNombre, unidad, cantidad, ubicacion, fecha(Date), motivo, paciente{}, origen, responsable, obs}]
let traslados = [];        // [{id, referencia, fecha(Date), tipo, estado, paciente, cedula, unidad, origen, destino, responsable, obs}]
let fallecidos = [];       // [{id, referencia, fecha(Date), nombre, cedula, edad, sexo, lugar, causa, destino, caso, responsable, obs}]
let resumenes = [];        // [{id(fecha ISO), fecha, ...totales, generadoPor, generadoEn}]
let usuarios = [];         // [{id(uid), usuario, email, rol, activo, creadoPor}]
let transferencias = [];   // [{id, referencia, fecha(Date), productoNombre, cantidad, origen, destino, responsable, obs}]
let pacientes = [];        // [{id, nombre, cedula, edad, sexo, telefono, caso, diagnostico, notas}]
let educacion = [];        // registros dpto. educación
let inspecciones = [];     // inspecciones técnicas
let actividades = [];      // registro de actividades
let combustible = [];      // registro de combustible
let usuarioActual = "";    // nombre del usuario con sesión activa
let rolActual = "";        // "admin" | "operador"

// =====================================================================
//  Utilidades
// =====================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ---------- Iconos SVG (sin emojis) ----------
const ICONOS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  entrada: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  pulso: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  alerta: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  camion: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  acta: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  impresora: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  mas: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  guardar: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  basura: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  editar: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  buscar: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  usuario: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  cerrar: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  warn: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  transfer: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  pacientes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  educacion: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  inspeccion: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/>',
  actividades: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  combustible: '<line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  ver: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  expediente: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
};
function ico(nombre, cls = "") {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ""}</svg>`;
}
function pintarIconos(root = document) {
  root.querySelectorAll("[data-ico]").forEach((el) => {
    el.innerHTML = ico(el.dataset.ico);
    el.removeAttribute("data-ico");
  });
}

function toast(msg, tipo = "") {
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 3200);
  setTimeout(() => t.remove(), 3600);
}

function hoyISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function fmtFecha(d) {
  if (!d) return "—";
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
}
function fmtFechaCorta(d) {
  if (!d) return "—";
  return d.toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function mismaFecha(d, iso) {
  if (!d || !iso) return false;
  const l = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return l === iso;
}

function esCritico(p) {
  const min = p.minimo ?? UMBRAL_CRITICO_DEFECTO;
  return (p.cantidad ?? 0) < min;
}
function tieneDeficit(p) {
  return (p.conteoInicial ?? 0) > 0 && (p.cantidad ?? 0) < (p.conteoInicial ?? 0);
}

function pillUbic(u) {
  const map = { "Depósito": "dep", "Módulo": "mod", "Oficina": "ofi" };
  return `<span class="pill ${map[u] || "dep"}">${u || "—"}</span>`;
}

function nuevaReferenciaPre(pre) {
  // Referencia única: prefijo + fecha + hora + aleatorio.
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  const base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const rnd = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${pre}-${base}-${rnd}`;
}
function nuevaReferencia(tipo) {
  // ENT para entradas, REF para débitos.
  return nuevaReferenciaPre(tipo === "entrada" ? "ENT" : "REF");
}

function escCSV(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function descargarCSV(nombre, filas) {
  const contenido = "﻿" + filas.map((f) => f.map(escCSV).join(";")).join("\r\n");
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================================
//  Sincronización en tiempo real
// =====================================================================
function iniciarEscuchas() {
  const est = $("#estadoConexion");

  onSnapshot(query(collection(db, "productos"), orderBy("nombre")), (snap) => {
    productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    est.className = "estado ok";
    est.querySelector(".txt").textContent = "Conectado";
    renderTodo();
  }, (err) => {
    console.error(err);
    est.className = "estado err";
    est.querySelector(".txt").textContent = "Sin conexión";
    toast("Error de conexión con Firestore: " + err.message, "err");
  });

  onSnapshot(query(collection(db, "movimientos"), orderBy("fecha", "desc")), (snap) => {
    movimientos = snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, ...x, fecha: x.fecha?.toDate ? x.fecha.toDate() : new Date(x.fecha) };
    });
    renderMovimientos();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "traslados"), orderBy("fecha", "desc")), (snap) => {
    traslados = snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, ...x, fecha: x.fecha?.toDate ? x.fecha.toDate() : new Date(x.fecha) };
    });
    renderTraslados();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "fallecidos"), orderBy("fecha", "desc")), (snap) => {
    fallecidos = snap.docs.map((d) => {
      const x = d.data();
      return { id: d.id, ...x, fecha: x.fecha?.toDate ? x.fecha.toDate() : new Date(x.fecha) };
    });
    renderFallecidos();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "resumenes"), orderBy("fecha", "desc")), (snap) => {
    resumenes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderResumenes();
  }, (err) => console.error(err));

  onSnapshot(collection(db, "usuarios"), (snap) => {
    usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    usuarios.sort((a, b) => (a.usuario || "").localeCompare(b.usuario || ""));
    renderUsuarios();
  }, (err) => console.error(err));

  const conFecha = (snap) => snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, ...x, fecha: x.fecha?.toDate ? x.fecha.toDate() : new Date(x.fecha) };
  });

  onSnapshot(query(collection(db, "transferencias"), orderBy("fecha", "desc")), (snap) => {
    transferencias = conFecha(snap); renderTransferencias();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "pacientes"), orderBy("nombre")), (snap) => {
    pacientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPacientes(); llenarSelectPacientes();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "educacion"), orderBy("fecha", "desc")), (snap) => {
    educacion = conFecha(snap); renderEducacion();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "inspecciones"), orderBy("fecha", "desc")), (snap) => {
    inspecciones = conFecha(snap); renderInspecciones();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "actividades"), orderBy("fecha", "desc")), (snap) => {
    actividades = conFecha(snap); renderActividades();
  }, (err) => console.error(err));

  onSnapshot(query(collection(db, "combustible"), orderBy("fecha", "desc")), (snap) => {
    combustible = conFecha(snap); renderCombustible();
  }, (err) => console.error(err));
}

// =====================================================================
//  Render — Dashboard
// =====================================================================
function renderTodo() {
  renderDashboard();
  renderInventario();
  renderCritico();
  llenarSelectsProductos();
  llenarCategorias();
  renderMovimientos();
  renderResumenHoy();
}

function renderDashboard() {
  const totalUnid = productos.reduce((s, p) => s + (p.cantidad || 0), 0);
  const criticos = productos.filter(esCritico);
  const deficits = productos.filter(tieneDeficit);

  $("#cTotalProd").textContent = productos.length;
  $("#cTotalUnid").textContent = totalUnid.toLocaleString("es-VE");
  $("#cCritico").textContent = criticos.length;
  $("#cDeficit").textContent = deficits.length;

  const badge = $("#badgeCritico");
  if (criticos.length) { badge.style.display = ""; badge.textContent = criticos.length; }
  else badge.style.display = "none";

  // Alertas
  const cont = $("#alertasDash");
  let html = "";
  if (criticos.length) {
    html += `<div class="alert-box rojo">${ico("alerta")}<div><b>${criticos.length} insumo(s) en nivel crítico</b> (por debajo del mínimo). Revisa la pestaña <b>Conteo crítico</b> para reabastecer.</div></div>`;
  }
  if (deficits.length) {
    html += `<div class="alert-box amar">${ico("warn")}<div><b>${deficits.length} insumo(s) con déficit</b> respecto a su conteo inicial. Verifica posibles faltantes o consumos no registrados.</div></div>`;
  }
  if (!criticos.length && !deficits.length && productos.length) {
    html += `<div class="alert-box verde">${ico("ok")}<div>Todos los insumos están por encima de su nivel mínimo y de su conteo inicial.</div></div>`;
  }
  cont.innerHTML = html;

  // Existencias por ubicación
  const ubics = ["Depósito", "Módulo", "Oficina"];
  $("#cardsUbicacion").innerHTML = ubics.map((u) => {
    const items = productos.filter((p) => (p.ubicacion || "Depósito") === u);
    const unid = items.reduce((s, p) => s + (p.cantidad || 0), 0);
    return `<div class="card"><div class="etq">${u}</div><div class="num">${unid.toLocaleString("es-VE")}</div><span class="hint">${items.length} insumo(s)</span></div>`;
  }).join("");
}

function renderMovimientos() {
  // Recientes en dashboard
  const rec = movimientos.slice(0, 10);
  $("#tbMovRecientes").innerHTML = rec.length ? rec.map((m) => `
    <tr>
      <td>${fmtFecha(m.fecha)}</td>
      <td><span class="pill ${m.tipo}">${m.tipo === "entrada" ? "Entrada" : "Débito"}</span></td>
      <td><span class="ref-cod">${m.referencia}</span></td>
      <td>${m.productoNombre}</td>
      <td class="num">${m.tipo === "entrada" ? "+" : "−"}${m.cantidad}</td>
      <td>${detalleMov(m)}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="vacio">Sin movimientos registrados.</td></tr>`;

  renderEntradas();
  renderDebitos();
  renderPacientes(); // los conteos de insumos por paciente dependen de los movimientos
}

function detalleMov(m) {
  if (m.tipo === "entrada") return m.origen || "—";
  if (m.motivo === "paciente") return "Paciente: " + (m.paciente?.nombre || "—");
  return "Extracción directa";
}

// =====================================================================
//  Render — Inventario
// =====================================================================
function renderInventario() {
  const txt = ($("#buscarInv").value || "").toLowerCase();
  const fUbic = $("#filtroUbic").value;
  const fEstado = $("#filtroEstado").value;

  let lista = productos.filter((p) => {
    if (fUbic && (p.ubicacion || "Depósito") !== fUbic) return false;
    if (fEstado === "critico" && !esCritico(p)) return false;
    if (fEstado === "deficit" && !tieneDeficit(p)) return false;
    if (txt && !(`${p.nombre} ${p.categoria || ""}`.toLowerCase().includes(txt))) return false;
    return true;
  });

  $("#tbInventario").innerHTML = lista.length ? lista.map((p) => {
    const crit = esCritico(p), def = tieneDeficit(p);
    let estado = `<span class="pill ok">OK</span>`;
    if (crit) estado = `<span class="pill critico">CRÍTICO</span>`;
    else if (def) estado = `<span class="pill bajo">DÉFICIT</span>`;
    return `<tr>
      <td><b>${p.nombre}</b><br><span class="hint">${p.unidad || "unidades"}</span></td>
      <td>${p.categoria || "—"}</td>
      <td>${pillUbic(p.ubicacion)}</td>
      <td class="num"><b>${(p.cantidad || 0).toLocaleString("es-VE")}</b></td>
      <td class="num">${p.minimo ?? UMBRAL_CRITICO_DEFECTO}</td>
      <td class="num">${p.conteoInicial ?? 0}</td>
      <td>${estado}</td>
      <td>
        <button class="btn gris sm ico-btn" data-editar="${p.id}" title="Editar">${ico("editar")}</button>
        <button class="btn peligro sm ico-btn" data-eliminar="${p.id}" title="Eliminar">${ico("basura")}</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="8" class="vacio">No hay insumos que coincidan.</td></tr>`;
}

// =====================================================================
//  Render — Entradas / Débitos
// =====================================================================
function renderEntradas() {
  const ent = movimientos.filter((m) => m.tipo === "entrada");
  const tb = $("#tbEntradas");
  if (!tb) return;
  tb.innerHTML = ent.length ? ent.map((m) => `
    <tr>
      <td>${fmtFecha(m.fecha)}</td>
      <td><span class="ref-cod">${m.referencia}</span></td>
      <td>${m.productoNombre}</td>
      <td class="num">+${m.cantidad}</td>
      <td>${m.origen || "—"}</td>
      <td>${m.responsable || "—"}</td>
      <td><button class="btn sec sm" data-ver-ent="${m.id}" title="Comprobante">${ico("ver")}</button></td>
    </tr>`).join("") : `<tr><td colspan="7" class="vacio">Sin entradas registradas.</td></tr>`;
}

function renderDebitos() {
  const fFecha = $("#filtroDebFecha")?.value;
  let deb = movimientos.filter((m) => m.tipo === "salida");
  if (fFecha) deb = deb.filter((m) => mismaFecha(m.fecha, fFecha));
  const tb = $("#tbDebitos");
  if (!tb) return;
  tb.innerHTML = deb.length ? deb.map((m) => `
    <tr>
      <td>${fmtFecha(m.fecha)}</td>
      <td><span class="ref-cod">${m.referencia}</span></td>
      <td>${m.atencion ? `<span class="ref-cod">${m.atencion}</span>` : "—"}</td>
      <td>${m.productoNombre}</td>
      <td class="num">−${m.cantidad}</td>
      <td>${m.motivo === "paciente" ? "Paciente" : "Extracción directa"}</td>
      <td>${m.paciente?.nombre ? `${m.paciente.nombre}${m.paciente.cedula ? " ("+m.paciente.cedula+")" : ""}` : "—"}</td>
      <td>${m.responsable || "—"}</td>
    </tr>`).join("") : `<tr><td colspan="8" class="vacio">Sin débitos registrados.</td></tr>`;
}

// =====================================================================
//  Render — Conteo crítico
// =====================================================================
function listaCritica() {
  return productos.filter(esCritico)
    .sort((a, b) => (a.cantidad || 0) - (b.cantidad || 0));
}
function renderCritico() {
  const lista = listaCritica();
  const box = $("#alertaCriticoBox");
  box.innerHTML = lista.length
    ? `<div class="alert-box rojo">${ico("alerta")}<div><b>${lista.length} insumo(s)</b> requieren reabastecimiento inmediato.</div></div>`
    : `<div class="alert-box verde">${ico("ok")}<div>No hay insumos en nivel crítico.</div></div>`;

  $("#tbCritico").innerHTML = lista.length ? lista.map((p) => {
    const min = p.minimo ?? UMBRAL_CRITICO_DEFECTO;
    const falta = Math.max(0, min - (p.cantidad || 0));
    return `<tr>
      <td><b>${p.nombre}</b></td>
      <td>${p.categoria || "—"}</td>
      <td>${pillUbic(p.ubicacion)}</td>
      <td class="num"><b style="color:var(--rojo)">${p.cantidad || 0}</b></td>
      <td class="num">${min}</td>
      <td class="num">${falta}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="vacio">Sin insumos críticos.</td></tr>`;
}

// =====================================================================
//  Selects de productos y categorías
// =====================================================================
function opcionesProductos() {
  return `<option value="">— Selecciona un insumo —</option>` +
    productos.map((p) => `<option value="${p.id}">${p.nombre} (${(p.cantidad || 0)} ${p.unidad || "u"} · ${p.ubicacion || "Depósito"})</option>`).join("");
}
function llenarSelectsProductos() {
  const opts = opcionesProductos();
  for (const id of ["#entProd", "#trfProd"]) {
    const sel = $(id);
    if (sel) { const v = sel.value; sel.innerHTML = opts; sel.value = v; }
  }
  $$(".debLineaProd").forEach((sel) => { const v = sel.value; sel.innerHTML = opts; sel.value = v; });
}

function llenarSelectPacientes() {
  const sel = $("#debPacienteSel");
  if (!sel) return;
  const v = sel.value;
  sel.innerHTML = `<option value="">— Escribir manualmente / nuevo —</option>` +
    pacientes.map((p) => `<option value="${p.id}">${p.nombre}${p.cedula ? " · " + p.cedula : ""}</option>`).join("");
  sel.value = v;
}

function aplicarPacienteSeleccionado() {
  const id = $("#debPacienteSel").value;
  const p = pacientes.find((x) => x.id === id);
  const campos = ["#debPacNombre", "#debPacCedula", "#debPacCaso"];
  if (p) {
    $("#debPacNombre").value = p.nombre || "";
    $("#debPacCedula").value = p.cedula || "";
    $("#debPacCaso").value = p.caso || "";
    campos.forEach((c) => $(c).setAttribute("readonly", "readonly"));
  } else {
    campos.forEach((c) => $(c).removeAttribute("readonly"));
  }
}

// ---- Líneas de insumos del débito (varios insumos por paciente) ----
function crearLineaDebito() {
  const div = document.createElement("div");
  div.className = "deb-linea";
  div.innerHTML =
    `<select class="debLineaProd lp" required>${opcionesProductos()}</select>` +
    `<input type="number" class="debLineaCant lc" min="1" step="1" placeholder="Cant." required />` +
    `<button type="button" class="btn peligro sm ico-btn linea-quitar lq" title="Quitar">${ico("basura")}</button>`;
  div.querySelector(".linea-quitar").onclick = () => {
    if ($$("#debLineas .deb-linea").length > 1) div.remove();
    else toast("Debe quedar al menos un insumo", "");
  };
  return div;
}
function agregarLineaDebito() { $("#debLineas").appendChild(crearLineaDebito()); }
function resetLineasDebito() { $("#debLineas").innerHTML = ""; agregarLineaDebito(); }
function llenarCategorias() {
  const cats = [...new Set(productos.map((p) => p.categoria).filter(Boolean))];
  $("#listaCategorias").innerHTML = cats.map((c) => `<option value="${c}">`).join("");
}

// =====================================================================
//  CRUD Producto
// =====================================================================
function abrirModalProd(p = null) {
  $("#modalProdTitulo").textContent = p ? "Editar insumo" : "Nuevo insumo";
  $("#prodId").value = p?.id || "";
  $("#prodNombre").value = p?.nombre || "";
  $("#prodCategoria").value = p?.categoria || "";
  $("#prodUnidad").value = p?.unidad || "unidades";
  $("#prodUbicacion").value = p?.ubicacion || "Depósito";
  $("#prodCantidad").value = p?.cantidad ?? 0;
  $("#prodInicial").value = p?.conteoInicial ?? (p ? 0 : 0);
  $("#prodMinimo").value = p?.minimo ?? UMBRAL_CRITICO_DEFECTO;
  $("#modalProd").classList.add("abierto");
}
function cerrarModalProd() { $("#modalProd").classList.remove("abierto"); }

async function guardarProd() {
  const id = $("#prodId").value;
  const nombre = $("#prodNombre").value.trim();
  if (!nombre) { toast("El nombre es obligatorio", "err"); return; }
  const datos = {
    nombre,
    categoria: $("#prodCategoria").value.trim(),
    unidad: $("#prodUnidad").value.trim() || "unidades",
    ubicacion: $("#prodUbicacion").value,
    cantidad: parseInt($("#prodCantidad").value) || 0,
    conteoInicial: parseInt($("#prodInicial").value) || 0,
    minimo: parseInt($("#prodMinimo").value) || UMBRAL_CRITICO_DEFECTO,
    actualizado: serverTimestamp(),
  };
  try {
    if (id) {
      await updateDoc(doc(db, "productos", id), datos);
      toast("Insumo actualizado", "ok");
    } else {
      datos.creado = serverTimestamp();
      await addDoc(collection(db, "productos"), datos);
      toast("Insumo registrado", "ok");
    }
    cerrarModalProd();
  } catch (e) {
    console.error(e); toast("Error al guardar: " + e.message, "err");
  }
}

async function eliminarProd(id) {
  const p = productos.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar el insumo "${p.nombre}"? Esta acción no borra su historial de movimientos.`)) return;
  try {
    await deleteDoc(doc(db, "productos", id));
    toast("Insumo eliminado", "ok");
  } catch (e) { toast("Error: " + e.message, "err"); }
}

// =====================================================================
//  Movimientos (entrada / débito) con transacción atómica
// =====================================================================
async function registrarMovimiento(mov) {
  // mov: {tipo, productoId, cantidad, fechaISO, ...extra}
  const prodRef = doc(db, "productos", mov.productoId);
  const referencia = nuevaReferencia(mov.tipo);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(prodRef);
    if (!snap.exists()) throw new Error("El insumo ya no existe.");
    const prod = snap.data();
    const actual = prod.cantidad || 0;
    let nueva;
    if (mov.tipo === "entrada") {
      nueva = actual + mov.cantidad;
    } else {
      if (mov.cantidad > actual) throw new Error(`Existencia insuficiente. Disponible: ${actual} ${prod.unidad || "u"}.`);
      nueva = actual - mov.cantidad;
    }
    tx.update(prodRef, { cantidad: nueva, actualizado: serverTimestamp() });

    const movRef = doc(collection(db, "movimientos"));
    tx.set(movRef, {
      tipo: mov.tipo,
      referencia,
      productoId: mov.productoId,
      productoNombre: prod.nombre,
      unidad: prod.unidad || "unidades",
      categoria: prod.categoria || "",
      cantidad: mov.cantidad,
      ubicacion: prod.ubicacion || "Depósito",
      existenciaResultante: nueva,
      fecha: Timestamp.fromDate(new Date(mov.fechaISO + "T" + new Date().toTimeString().slice(0, 8))),
      motivo: mov.motivo || null,
      paciente: mov.paciente || null,
      pacienteId: mov.pacienteId || null,
      atencion: mov.atencion || null,
      origen: mov.origen || null,
      responsable: mov.responsable || null,
      obs: mov.obs || null,
      creado: serverTimestamp(),
    });
  });
  return referencia;
}

async function onSubmitEntrada(e) {
  e.preventDefault();
  const productoId = $("#entProd").value;
  const cantidad = parseInt($("#entCant").value);
  if (!productoId) { toast("Selecciona un insumo", "err"); return; }
  if (!cantidad || cantidad <= 0) { toast("Cantidad inválida", "err"); return; }
  try {
    const ref = await registrarMovimiento({
      tipo: "entrada",
      productoId, cantidad,
      fechaISO: $("#entFecha").value || hoyISO(),
      origen: $("#entOrigen").value.trim(),
      responsable: $("#entResp").value.trim(),
      obs: $("#entObs").value.trim(),
    });
    toast("Entrada registrada · " + ref, "ok");
    e.target.reset();
    $("#entFecha").value = hoyISO();
  } catch (err) { console.error(err); toast("Error: " + err.message, "err"); }
}

async function onSubmitDebito(e) {
  e.preventDefault();
  const motivo = $("#debMotivo").value;

  // Recolectar las líneas de insumos
  const lineas = [];
  for (const f of $$("#debLineas .deb-linea")) {
    const pid = f.querySelector(".debLineaProd").value;
    const cant = parseInt(f.querySelector(".debLineaCant").value);
    if (!pid && !f.querySelector(".debLineaCant").value) continue; // línea vacía
    if (!pid) { toast("Selecciona el insumo en todas las líneas", "err"); return; }
    if (!cant || cant <= 0) { toast("Cantidad inválida en una de las líneas", "err"); return; }
    lineas.push({ productoId: pid, cantidad: cant });
  }
  if (!lineas.length) { toast("Agrega al menos un insumo", "err"); return; }

  // Pre-validar existencias (suma por producto, por si se repite)
  const necesario = {};
  for (const ln of lineas) necesario[ln.productoId] = (necesario[ln.productoId] || 0) + ln.cantidad;
  for (const pid in necesario) {
    const prod = productos.find((p) => p.id === pid);
    if (!prod) { toast("Un insumo seleccionado ya no existe", "err"); return; }
    if (necesario[pid] > (prod.cantidad || 0)) {
      toast(`Existencia insuficiente de ${prod.nombre} (disponible: ${prod.cantidad || 0})`, "err"); return;
    }
  }

  let paciente = null, pacienteId = null;
  if (motivo === "paciente") {
    pacienteId = $("#debPacienteSel").value || null;
    const nombre = $("#debPacNombre").value.trim();
    if (!nombre) { toast("Indica el nombre del paciente", "err"); return; }
    paciente = { nombre, cedula: $("#debPacCedula").value.trim(), caso: $("#debPacCaso").value.trim() };
  }

  const fechaISO = $("#debFecha").value || hoyISO();
  const responsable = $("#debResp").value.trim() || usuarioActual;
  const obs = $("#debObs").value.trim();
  const atencion = nuevaReferenciaPre("ATN"); // referencia común de la atención

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  const refs = [], errores = [];
  for (const ln of lineas) {
    try {
      const ref = await registrarMovimiento({
        tipo: "salida", productoId: ln.productoId, cantidad: ln.cantidad,
        motivo, paciente, pacienteId, fechaISO, responsable, obs, atencion,
      });
      refs.push(ref);
    } catch (err) {
      const prod = productos.find((p) => p.id === ln.productoId);
      errores.push((prod ? prod.nombre : "insumo") + ": " + err.message);
    }
  }
  btn.disabled = false;

  if (refs.length) toast(`Débito registrado · ${refs.length} insumo(s) · ${atencion}`, "ok");
  if (errores.length) { toast("No se registró: " + errores.join(" | "), "err"); return; }

  e.target.reset();
  $("#debFecha").value = hoyISO();
  resetLineasDebito();
  aplicarVisibilidadPaciente();
  aplicarPacienteSeleccionado();
}

function aplicarVisibilidadPaciente() {
  const esPac = $("#debMotivo").value === "paciente";
  $(".campos-paciente").style.display = esPac ? "grid" : "none";
  $("#debPacNombre").required = esPac;
}

// =====================================================================
//  Exportaciones CSV
// =====================================================================
function exportInventario() {
  const filas = [["Nombre", "Categoría", "Unidad", "Ubicación", "Existencia", "Mínimo", "Conteo inicial", "Estado"]];
  productos.forEach((p) => filas.push([
    p.nombre, p.categoria || "", p.unidad || "unidades", p.ubicacion || "Depósito",
    p.cantidad || 0, p.minimo ?? UMBRAL_CRITICO_DEFECTO, p.conteoInicial ?? 0,
    esCritico(p) ? "CRÍTICO" : (tieneDeficit(p) ? "DÉFICIT" : "OK"),
  ]));
  descargarCSV(`inventario_${hoyISO()}.csv`, filas);
  toast("Inventario exportado", "ok");
}

function exportCritico() {
  const lista = listaCritica();
  if (!lista.length) { toast("No hay insumos críticos", ""); return; }
  const filas = [["Insumo", "Categoría", "Ubicación", "Existencia", "Mínimo", "Faltante"]];
  lista.forEach((p) => {
    const min = p.minimo ?? UMBRAL_CRITICO_DEFECTO;
    filas.push([p.nombre, p.categoria || "", p.ubicacion || "Depósito", p.cantidad || 0, min, Math.max(0, min - (p.cantidad || 0))]);
  });
  descargarCSV(`conteo_critico_${hoyISO()}.csv`, filas);
  toast("Conteo crítico exportado", "ok");
}

function exportEntradas() {
  const ent = movimientos.filter((m) => m.tipo === "entrada");
  if (!ent.length) { toast("Sin entradas", ""); return; }
  const filas = [["Fecha", "Referencia", "Insumo", "Cantidad", "Unidad", "Origen", "Responsable", "Observaciones"]];
  ent.forEach((m) => filas.push([fmtFecha(m.fecha), m.referencia, m.productoNombre, m.cantidad, m.unidad || "", m.origen || "", m.responsable || "", m.obs || ""]));
  descargarCSV(`entradas_${hoyISO()}.csv`, filas);
  toast("Entradas exportadas", "ok");
}

function exportDebitos() {
  const fFecha = $("#filtroDebFecha")?.value;
  let deb = movimientos.filter((m) => m.tipo === "salida");
  if (fFecha) deb = deb.filter((m) => mismaFecha(m.fecha, fFecha));
  if (!deb.length) { toast("Sin débitos", ""); return; }
  const filas = [["Fecha", "Referencia", "Atención", "Insumo", "Cantidad", "Unidad", "Motivo", "Paciente", "Cédula", "N.º caso", "Responsable", "Especificaciones"]];
  deb.forEach((m) => filas.push([
    fmtFecha(m.fecha), m.referencia, m.atencion || "", m.productoNombre, m.cantidad, m.unidad || "",
    m.motivo === "paciente" ? "Paciente" : "Extracción directa",
    m.paciente?.nombre || "", m.paciente?.cedula || "", m.paciente?.caso || "",
    m.responsable || "", m.obs || "",
  ]));
  descargarCSV(`debitos_${fFecha || hoyISO()}.csv`, filas);
  toast("Débitos exportados", "ok");
}

// =====================================================================
//  Reportes imprimibles
// =====================================================================
const LOGO_URL = "assets/logo.png";
function cabeceraReporte(titulo, subtitulo) {
  return `
    <div class="rep-head">
      <img src="${LOGO_URL}" alt="PC" />
      <div>
        <h1>Protección Civil y Administración de Desastres</h1>
        <div class="org">República Bolivariana de Venezuela</div>
        <h2>${titulo}</h2>
        ${subtitulo ? `<div class="sub">${subtitulo}</div>` : ""}
      </div>
    </div>`;
}

function imprimirHTML(titulo, cuerpoHTML) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast("Permite las ventanas emergentes para imprimir", "err"); return; }
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title>
  <style>
    body{font-family:"Segoe UI",Arial,sans-serif;color:#1c2733;margin:32px;font-size:13px}
    .rep-head{display:flex;gap:16px;align-items:center;border-bottom:3px solid #e8730c;padding-bottom:14px;margin-bottom:18px}
    .rep-head img{width:70px;height:70px;object-fit:contain}
    .rep-head h1{font-size:16px;margin:0;color:#2b2252}
    .rep-head .org{font-size:12px;color:#66727f}
    .rep-head h2{font-size:15px;margin:6px 0 0;color:#e8730c}
    .rep-head .sub{font-size:12px;color:#66727f;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}
    th,td{border:1px solid #cdd5df;padding:7px 9px;text-align:left}
    th{background:#f0f3f7;text-transform:uppercase;font-size:11px;letter-spacing:.4px}
    td.num,th.num{text-align:right}
    h3{color:#2b2252;border-bottom:1px solid #e2e7ee;padding-bottom:5px;margin-top:22px;font-size:14px}
    .tot{font-weight:700;background:#fafbfc}
    .meta{display:flex;gap:24px;flex-wrap:wrap;margin:10px 0;font-size:12px}
    .meta b{color:#2b2252}
    .ref{font-family:Consolas,monospace;font-size:11px}
    .firma{margin-top:60px;display:flex;justify-content:space-around;text-align:center;font-size:12px}
    .firma div{border-top:1px solid #333;padding-top:6px;width:220px}
    .pie{margin-top:30px;font-size:11px;color:#8a94a0;text-align:center;border-top:1px solid #e2e7ee;padding-top:8px}
    @media print{body{margin:14mm}.noprint{display:none}}
  </style></head><body>${cuerpoHTML}
  <div class="pie">Documento generado el ${fmtFecha(new Date())} · Sistema de Gestión de Insumos · Protección Civil Venezuela</div>
  <div class="noprint" style="text-align:center;margin-top:20px">
    <button onclick="window.print()" style="padding:10px 22px;background:#e8730c;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">Imprimir</button>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
  </body></html>`);
  w.document.close();
}

function reporteDiario() {
  const iso = $("#repFecha").value || hoyISO();
  const delDia = movimientos.filter((m) => mismaFecha(m.fecha, iso));
  const entradas = delDia.filter((m) => m.tipo === "entrada");
  const salidas = delDia.filter((m) => m.tipo === "salida");
  const totEnt = entradas.reduce((s, m) => s + m.cantidad, 0);
  const totSal = salidas.reduce((s, m) => s + m.cantidad, 0);

  const filasSal = salidas.map((m) => `<tr>
    <td class="ref">${m.referencia}</td>
    <td>${m.productoNombre}</td>
    <td class="num">${m.cantidad}</td>
    <td>${m.motivo === "paciente" ? "Paciente" : "Extracción directa"}</td>
    <td>${m.paciente?.nombre ? `${m.paciente.nombre}${m.paciente.cedula ? " ("+m.paciente.cedula+")" : ""}` : "—"}</td>
    <td>${m.responsable || "—"}</td>
    <td>${m.obs || ""}</td></tr>`).join("");

  const filasEnt = entradas.map((m) => `<tr>
    <td class="ref">${m.referencia}</td>
    <td>${m.productoNombre}</td>
    <td class="num">${m.cantidad}</td>
    <td>${m.origen || "—"}</td>
    <td>${m.responsable || "—"}</td>
    <td>${m.obs || ""}</td></tr>`).join("");

  const cuerpo = cabeceraReporte("Reporte diario de insumos", "Fecha: " + fmtFechaCorta(new Date(iso + "T12:00:00"))) + `
    <div class="meta">
      <span><b>Entradas:</b> ${entradas.length} mov. (+${totEnt} u)</span>
      <span><b>Débitos:</b> ${salidas.length} mov. (−${totSal} u)</span>
      <span><b>Pacientes atendidos:</b> ${new Set(salidas.filter(m=>m.motivo==="paciente").map(m=>m.paciente?.cedula||m.paciente?.nombre)).size}</span>
    </div>

    <h3>Débitos de insumos (${salidas.length})</h3>
    ${salidas.length ? `<table><thead><tr><th>Referencia</th><th>Insumo</th><th class="num">Cant.</th><th>Motivo</th><th>Paciente</th><th>Responsable</th><th>Especificaciones</th></tr></thead>
      <tbody>${filasSal}<tr class="tot"><td colspan="2">TOTAL DEBITADO</td><td class="num">${totSal}</td><td colspan="4"></td></tr></tbody></table>`
      : `<p>Sin débitos registrados en la fecha.</p>`}

    <h3>Entradas de insumos (${entradas.length})</h3>
    ${entradas.length ? `<table><thead><tr><th>Referencia</th><th>Insumo</th><th class="num">Cant.</th><th>Origen</th><th>Responsable</th><th>Observaciones</th></tr></thead>
      <tbody>${filasEnt}<tr class="tot"><td colspan="2">TOTAL INGRESADO</td><td class="num">${totEnt}</td><td colspan="3"></td></tr></tbody></table>`
      : `<p>Sin entradas registradas en la fecha.</p>`}

    <div class="firma"><div>Responsable de almacén</div><div>Coordinador</div></div>`;

  imprimirHTML("Reporte diario " + iso, cuerpo);
}

function reportePaciente() {
  const busca = ($("#repPaciente").value || "").trim().toLowerCase();
  const fecha = $("#repPacFecha").value;
  if (!busca) { toast("Indica el nombre o cédula del paciente", "err"); return; }

  let regs = movimientos.filter((m) => m.tipo === "salida" && m.motivo === "paciente" && m.paciente);
  regs = regs.filter((m) => `${m.paciente.nombre} ${m.paciente.cedula || ""}`.toLowerCase().includes(busca));
  if (fecha) regs = regs.filter((m) => mismaFecha(m.fecha, fecha));
  if (!regs.length) { toast("No se encontraron débitos para ese paciente", "err"); return; }

  regs.sort((a, b) => a.fecha - b.fecha);
  const pac = regs[0].paciente;
  const total = regs.reduce((s, m) => s + m.cantidad, 0);

  const filas = regs.map((m) => `<tr>
    <td>${fmtFecha(m.fecha)}</td>
    <td class="ref">${m.atencion || "—"}</td>
    <td>${m.productoNombre}</td>
    <td class="num">${m.cantidad}</td>
    <td>${m.unidad || ""}</td>
    <td>${m.responsable || "—"}</td>
    <td>${m.obs || ""}</td></tr>`).join("");

  const cuerpo = cabeceraReporte("Reporte de insumos por paciente", fecha ? "Fecha: " + fmtFechaCorta(new Date(fecha + "T12:00:00")) : "Historial completo") + `
    <div class="meta">
      <span><b>Paciente:</b> ${pac.nombre}</span>
      <span><b>Cédula:</b> ${pac.cedula || "—"}</span>
      <span><b>N.º caso:</b> ${pac.caso || "—"}</span>
      <span><b>Total de insumos:</b> ${total} u en ${regs.length} registro(s)</span>
    </div>
    <table><thead><tr><th>Fecha</th><th>Atención</th><th>Insumo</th><th class="num">Cant.</th><th>Unidad</th><th>Responsable</th><th>Especificaciones</th></tr></thead>
    <tbody>${filas}<tr class="tot"><td colspan="3">TOTAL</td><td class="num">${total}</td><td colspan="3"></td></tr></tbody></table>
    <div class="firma"><div>Paramédico responsable</div><div>Coordinador</div></div>`;

  imprimirHTML("Reporte paciente " + pac.nombre, cuerpo);
}

function reporteInventario() {
  const filas = productos.map((p) => `<tr>
    <td>${p.nombre}</td><td>${p.categoria || "—"}</td><td>${p.ubicacion || "Depósito"}</td>
    <td class="num">${p.cantidad || 0}</td><td class="num">${p.minimo ?? UMBRAL_CRITICO_DEFECTO}</td>
    <td class="num">${p.conteoInicial ?? 0}</td>
    <td>${esCritico(p) ? "CRÍTICO" : (tieneDeficit(p) ? "DÉFICIT" : "OK")}</td></tr>`).join("");
  const totU = productos.reduce((s, p) => s + (p.cantidad || 0), 0);

  const cuerpo = cabeceraReporte("Inventario total de insumos", "Corte al " + fmtFecha(new Date())) + `
    <div class="meta"><span><b>Insumos:</b> ${productos.length}</span><span><b>Unidades totales:</b> ${totU}</span>
    <span><b>Críticos:</b> ${productos.filter(esCritico).length}</span></div>
    <table><thead><tr><th>Insumo</th><th>Categoría</th><th>Ubicación</th><th class="num">Existencia</th><th class="num">Mínimo</th><th class="num">Inicial</th><th>Estado</th></tr></thead>
    <tbody>${filas}<tr class="tot"><td colspan="3">TOTAL UNIDADES</td><td class="num">${totU}</td><td colspan="3"></td></tr></tbody></table>
    <div class="firma"><div>Responsable de almacén</div><div>Coordinador</div></div>`;
  imprimirHTML("Inventario total", cuerpo);
}

function imprimirCritico() {
  const lista = listaCritica();
  const filas = lista.map((p) => {
    const min = p.minimo ?? UMBRAL_CRITICO_DEFECTO;
    return `<tr><td>${p.nombre}</td><td>${p.categoria || "—"}</td><td>${p.ubicacion || "Depósito"}</td>
      <td class="num">${p.cantidad || 0}</td><td class="num">${min}</td><td class="num">${Math.max(0, min - (p.cantidad||0))}</td></tr>`;
  }).join("");
  const cuerpo = cabeceraReporte("Conteo crítico de insumos", "Insumos por debajo del mínimo · " + fmtFecha(new Date())) + `
    <div class="meta"><span><b>Insumos críticos:</b> ${lista.length}</span></div>
    ${lista.length ? `<table><thead><tr><th>Insumo</th><th>Categoría</th><th>Ubicación</th><th class="num">Existencia</th><th class="num">Mínimo</th><th class="num">Faltante</th></tr></thead><tbody>${filas}</tbody></table>`
      : `<p>No hay insumos en nivel crítico.</p>`}
    <div class="firma"><div>Responsable de almacén</div><div>Coordinador</div></div>`;
  imprimirHTML("Conteo crítico", cuerpo);
}

// =====================================================================
//  TRASLADOS
// =====================================================================
function pillEstadoTras(e) {
  const map = { completado: ["ok", "Completado"], en_curso: ["mod", "En curso"], cancelado: ["bajo", "Cancelado"] };
  const [cls, txt] = map[e] || ["dep", e || "—"];
  return `<span class="pill ${cls}">${txt}</span>`;
}

function renderTraslados() {
  const hoy = hoyISO();
  $("#cTrasTotal").textContent = traslados.length;
  $("#cTrasHoy").textContent = traslados.filter((t) => mismaFecha(t.fecha, hoy)).length;
  $("#cTrasCurso").textContent = traslados.filter((t) => t.estado === "en_curso").length;

  const fFecha = $("#filtroTrasFecha")?.value;
  let lista = traslados;
  if (fFecha) lista = lista.filter((t) => mismaFecha(t.fecha, fFecha));

  const tb = $("#tbTraslados");
  if (!tb) return;
  tb.innerHTML = lista.length ? lista.map((t) => `
    <tr>
      <td>${fmtFecha(t.fecha)}</td>
      <td><span class="ref-cod">${t.referencia}</span></td>
      <td>${t.tipo || "—"}</td>
      <td>${t.paciente ? `${t.paciente}${t.cedula ? " ("+t.cedula+")" : ""}` : "—"}</td>
      <td>${t.origen || "—"}</td>
      <td><b>${t.destino || "—"}</b></td>
      <td>${t.unidad || "—"}</td>
      <td>${pillEstadoTras(t.estado)}</td>
      <td><button class="btn peligro sm ico-btn" data-del-tras="${t.id}" title="Eliminar">${ico("basura")}</button></td>
    </tr>`).join("") : `<tr><td colspan="9" class="vacio">Sin traslados registrados.</td></tr>`;
}

async function onSubmitTraslado(e) {
  e.preventDefault();
  const origen = $("#trasOrigen").value.trim();
  const destino = $("#trasDestino").value.trim();
  if (!origen || !destino) { toast("Origen y destino son obligatorios", "err"); return; }
  const fechaISO = $("#trasFecha").value || hoyISO();
  const datos = {
    referencia: nuevaReferenciaPre("TR"),
    fecha: Timestamp.fromDate(new Date(fechaISO + "T" + new Date().toTimeString().slice(0, 8))),
    tipo: $("#trasTipo").value,
    estado: $("#trasEstado").value,
    paciente: $("#trasPaciente").value.trim(),
    cedula: $("#trasCedula").value.trim(),
    unidad: $("#trasUnidad").value.trim(),
    origen, destino,
    responsable: $("#trasResp").value.trim(),
    obs: $("#trasObs").value.trim(),
    creado: serverTimestamp(),
  };
  try {
    await addDoc(collection(db, "traslados"), datos);
    toast("Traslado registrado · " + datos.referencia, "ok");
    e.target.reset();
    $("#trasFecha").value = hoyISO();
  } catch (err) { console.error(err); toast("Error: " + err.message, "err"); }
}

async function eliminarTraslado(id) {
  if (!confirm("¿Eliminar este registro de traslado?")) return;
  try { await deleteDoc(doc(db, "traslados", id)); toast("Traslado eliminado", "ok"); }
  catch (e) { toast("Error: " + e.message, "err"); }
}

function exportTraslados() {
  const fFecha = $("#filtroTrasFecha")?.value;
  let lista = traslados;
  if (fFecha) lista = lista.filter((t) => mismaFecha(t.fecha, fFecha));
  if (!lista.length) { toast("Sin traslados", ""); return; }
  const filas = [["Fecha", "Referencia", "Tipo", "Estado", "Paciente", "Cédula", "Unidad", "Origen", "Destino", "Responsable", "Observaciones"]];
  lista.forEach((t) => filas.push([fmtFecha(t.fecha), t.referencia, t.tipo || "", t.estado || "", t.paciente || "", t.cedula || "", t.unidad || "", t.origen || "", t.destino || "", t.responsable || "", t.obs || ""]));
  descargarCSV(`traslados_${fFecha || hoyISO()}.csv`, filas);
  toast("Traslados exportados", "ok");
}

function imprimirTraslados() {
  const fFecha = $("#filtroTrasFecha")?.value;
  let lista = traslados;
  if (fFecha) lista = lista.filter((t) => mismaFecha(t.fecha, fFecha));
  const filas = lista.map((t) => `<tr>
    <td>${fmtFecha(t.fecha)}</td><td class="ref">${t.referencia}</td><td>${t.tipo || "—"}</td>
    <td>${t.paciente ? `${t.paciente}${t.cedula ? " ("+t.cedula+")" : ""}` : "—"}</td>
    <td>${t.origen || "—"}</td><td>${t.destino || "—"}</td><td>${t.unidad || "—"}</td>
    <td>${({completado:"Completado",en_curso:"En curso",cancelado:"Cancelado"})[t.estado] || "—"}</td>
    <td>${t.responsable || "—"}</td></tr>`).join("");
  const sub = fFecha ? "Fecha: " + fmtFechaCorta(new Date(fFecha + "T12:00:00")) : "Historial completo · " + fmtFecha(new Date());
  const cuerpo = cabeceraReporte("Reporte de traslados", sub) + `
    <div class="meta"><span><b>Total:</b> ${lista.length}</span>
    <span><b>Completados:</b> ${lista.filter(t=>t.estado==="completado").length}</span>
    <span><b>En curso:</b> ${lista.filter(t=>t.estado==="en_curso").length}</span></div>
    ${lista.length ? `<table><thead><tr><th>Fecha</th><th>Referencia</th><th>Tipo</th><th>Paciente</th><th>Origen</th><th>Destino</th><th>Unidad</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>${filas}</tbody></table>`
      : `<p>Sin traslados registrados.</p>`}
    <div class="firma"><div>Responsable de operaciones</div><div>Coordinador</div></div>`;
  imprimirHTML("Reporte de traslados", cuerpo);
}

// =====================================================================
//  FALLECIDOS
// =====================================================================
function renderFallecidos() {
  const hoy = hoyISO();
  $("#cFallTotal").textContent = fallecidos.length;
  $("#cFallHoy").textContent = fallecidos.filter((f) => mismaFecha(f.fecha, hoy)).length;

  const tb = $("#tbFallecidos");
  if (!tb) return;
  tb.innerHTML = fallecidos.length ? fallecidos.map((f) => `
    <tr>
      <td>${fmtFecha(f.fecha)}</td>
      <td><span class="ref-cod">${f.referencia}</span></td>
      <td><b>${f.nombre || "—"}</b></td>
      <td>${f.cedula || "—"}</td>
      <td>${f.edad ?? "—"}</td>
      <td>${f.causa || "—"}</td>
      <td>${f.lugar || "—"}</td>
      <td>${f.destino || "—"}</td>
      <td>
        <button class="btn sec sm" data-print-fall="${f.id}" title="Informe">${ico("ver")}</button>
        <button class="btn peligro sm ico-btn" data-del-fall="${f.id}" title="Eliminar">${ico("basura")}</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="9" class="vacio">Sin registros.</td></tr>`;
}

async function onSubmitFallecido(e) {
  e.preventDefault();
  const nombre = $("#falNombre").value.trim();
  if (!nombre) { toast("El nombre es obligatorio", "err"); return; }
  const fechaVal = $("#falFecha").value; // datetime-local
  const fecha = fechaVal ? new Date(fechaVal) : new Date();
  const datos = {
    referencia: nuevaReferenciaPre("FA"),
    fecha: Timestamp.fromDate(fecha),
    nombre,
    cedula: $("#falCedula").value.trim(),
    edad: $("#falEdad").value ? parseInt($("#falEdad").value) : null,
    sexo: $("#falSexo").value,
    lugar: $("#falLugar").value.trim(),
    causa: $("#falCausa").value.trim(),
    destino: $("#falDestino").value,
    caso: $("#falCaso").value.trim(),
    responsable: $("#falResp").value.trim(),
    obs: $("#falObs").value.trim(),
    creado: serverTimestamp(),
  };
  try {
    await addDoc(collection(db, "fallecidos"), datos);
    toast("Registro guardado · " + datos.referencia, "ok");
    e.target.reset();
  } catch (err) { console.error(err); toast("Error: " + err.message, "err"); }
}

async function eliminarFallecido(id) {
  if (!confirm("¿Eliminar este registro?")) return;
  try { await deleteDoc(doc(db, "fallecidos", id)); toast("Registro eliminado", "ok"); }
  catch (e) { toast("Error: " + e.message, "err"); }
}

function exportFallecidos() {
  if (!fallecidos.length) { toast("Sin registros", ""); return; }
  const filas = [["Fecha", "Referencia", "Nombre", "Cédula", "Edad", "Sexo", "Lugar", "Causa", "Destino cuerpo", "N.º caso", "Responsable", "Observaciones"]];
  fallecidos.forEach((f) => filas.push([fmtFecha(f.fecha), f.referencia, f.nombre || "", f.cedula || "", f.edad ?? "", f.sexo || "", f.lugar || "", f.causa || "", f.destino || "", f.caso || "", f.responsable || "", f.obs || ""]));
  descargarCSV(`fallecidos_${hoyISO()}.csv`, filas);
  toast("Registros exportados", "ok");
}

function imprimirFallecidos() {
  const filas = fallecidos.map((f) => `<tr>
    <td>${fmtFecha(f.fecha)}</td><td class="ref">${f.referencia}</td><td>${f.nombre || "—"}</td>
    <td>${f.cedula || "—"}</td><td class="num">${f.edad ?? "—"}</td><td>${f.sexo || "—"}</td>
    <td>${f.causa || "—"}</td><td>${f.lugar || "—"}</td><td>${f.destino || "—"}</td></tr>`).join("");
  const cuerpo = cabeceraReporte("Registro de fallecidos", "Corte al " + fmtFecha(new Date())) + `
    <div class="meta"><span><b>Total de registros:</b> ${fallecidos.length}</span></div>
    ${fallecidos.length ? `<table><thead><tr><th>Fecha</th><th>Referencia</th><th>Nombre</th><th>Cédula</th><th class="num">Edad</th><th>Sexo</th><th>Causa</th><th>Lugar</th><th>Destino</th></tr></thead><tbody>${filas}</tbody></table>`
      : `<p>Sin registros.</p>`}
    <div class="firma"><div>Funcionario responsable</div><div>Coordinador</div></div>`;
  imprimirHTML("Registro de fallecidos", cuerpo);
}

// =====================================================================
//  RESUMEN DIARIO (cierre del día)
// =====================================================================
function totalesDelDia(iso) {
  const ent = movimientos.filter((m) => m.tipo === "entrada" && mismaFecha(m.fecha, iso));
  const sal = movimientos.filter((m) => m.tipo === "salida" && mismaFecha(m.fecha, iso));
  const tras = traslados.filter((t) => mismaFecha(t.fecha, iso));
  const fall = fallecidos.filter((f) => mismaFecha(f.fecha, iso));
  return {
    fecha: iso,
    entradasMov: ent.length,
    entradasUnid: ent.reduce((s, m) => s + m.cantidad, 0),
    debitosMov: sal.length,
    debitosUnid: sal.reduce((s, m) => s + m.cantidad, 0),
    pacientes: new Set(sal.filter((m) => m.motivo === "paciente").map((m) => m.paciente?.cedula || m.paciente?.nombre)).size,
    traslados: tras.length,
    trasCompletados: tras.filter((t) => t.estado === "completado").length,
    trasEnCurso: tras.filter((t) => t.estado === "en_curso").length,
    fallecidos: fall.length,
    invProductos: productos.length,
    invUnidades: productos.reduce((s, p) => s + (p.cantidad || 0), 0),
    invCriticos: productos.filter(esCritico).length,
    invDeficit: productos.filter(tieneDeficit).length,
  };
}

function renderResumenHoy() {
  const cont = $("#resHoyCards");
  if (!cont) return;
  const iso = hoyISO();
  const t = totalesDelDia(iso);
  $("#resHoyFecha").textContent = fmtFechaCorta(new Date(iso + "T12:00:00"));

  cont.innerHTML = `
    <div class="card ok"><div class="etq">Entradas (unidades)</div><div class="num">${t.entradasUnid}</div><span class="hint">${t.entradasMov} movimiento(s)</span></div>
    <div class="card alerta"><div class="etq">Débitos (unidades)</div><div class="num">${t.debitosUnid}</div><span class="hint">${t.debitosMov} movimiento(s)</span></div>
    <div class="card"><div class="etq">Pacientes atendidos</div><div class="num">${t.pacientes}</div></div>
    <div class="card"><div class="etq">Traslados</div><div class="num">${t.traslados}</div><span class="hint">${t.trasCompletados} compl. · ${t.trasEnCurso} en curso</span></div>
    <div class="card"><div class="etq">Fallecidos</div><div class="num">${t.fallecidos}</div></div>
    <div class="card aviso"><div class="etq">Insumos críticos</div><div class="num">${t.invCriticos}</div></div>`;

  $("#tbResHoy").innerHTML = `
    <tr><td><b>Entradas de insumos</b></td><td class="num">${t.entradasMov}</td><td class="num">+${t.entradasUnid} u</td><td>Ingresos del día</td></tr>
    <tr><td><b>Débitos de insumos</b></td><td class="num">${t.debitosMov}</td><td class="num">−${t.debitosUnid} u</td><td>${t.pacientes} paciente(s) atendido(s)</td></tr>
    <tr><td><b>Traslados</b></td><td class="num">${t.traslados}</td><td class="num">${t.traslados} registro(s)</td><td>${t.trasCompletados} completados, ${t.trasEnCurso} en curso</td></tr>
    <tr><td><b>Fallecidos</b></td><td class="num">${t.fallecidos}</td><td class="num">${t.fallecidos} registro(s)</td><td>Registrados hoy</td></tr>
    <tr><td><b>Inventario (corte actual)</b></td><td class="num">${t.invProductos}</td><td class="num">${t.invUnidades} u</td><td>${t.invCriticos} críticos · ${t.invDeficit} con déficit</td></tr>`;

  const guardado = resumenes.find((r) => r.id === iso);
  $("#resHoyGuardado").innerHTML = guardado
    ? `<div class="alert-box verde">${ico("ok")}<div>Cierre del día ya guardado por <b>${guardado.generadoPor || "—"}</b>. Puedes actualizarlo si hubo cambios.</div></div>`
    : `<div class="alert-box amar">${ico("warn")}<div>El cierre de hoy aún no se ha guardado. Presiona <b>Guardar cierre del día</b> al finalizar la jornada.</div></div>`;
}

function renderResumenes() {
  renderResumenHoy();
  const tb = $("#tbResumenes");
  if (!tb) return;
  tb.innerHTML = resumenes.length ? resumenes.map((r) => `
    <tr>
      <td><b>${fmtFechaCorta(new Date(r.fecha + "T12:00:00"))}</b></td>
      <td class="num">${r.entradasUnid ?? 0}</td>
      <td class="num">${r.debitosUnid ?? 0}</td>
      <td class="num">${r.pacientes ?? 0}</td>
      <td class="num">${r.traslados ?? 0}</td>
      <td class="num">${r.fallecidos ?? 0}</td>
      <td class="num">${r.invCriticos ?? 0}</td>
      <td>${r.generadoPor || "—"}</td>
      <td><button class="btn gris sm" data-print-res="${r.id}">Imprimir</button></td>
    </tr>`).join("") : `<tr><td colspan="9" class="vacio">Aún no hay cierres diarios guardados.</td></tr>`;
}

async function guardarCierre() {
  const iso = hoyISO();
  const t = totalesDelDia(iso);
  try {
    await setDoc(doc(db, "resumenes", iso), {
      ...t,
      generadoPor: usuarioActual || "—",
      generadoEn: serverTimestamp(),
    });
    toast("Cierre del día guardado (" + fmtFechaCorta(new Date(iso + "T12:00:00")) + ")", "ok");
  } catch (e) { console.error(e); toast("Error al guardar: " + e.message, "err"); }
}

function imprimirResumen(iso, t) {
  const cuerpo = cabeceraReporte("Resumen diario general", "Fecha: " + fmtFechaCorta(new Date(iso + "T12:00:00"))) + `
    <div class="meta">
      <span><b>Entradas:</b> ${t.entradasMov} mov · +${t.entradasUnid} u</span>
      <span><b>Débitos:</b> ${t.debitosMov} mov · −${t.debitosUnid} u</span>
      <span><b>Pacientes:</b> ${t.pacientes}</span>
    </div>
    <table><thead><tr><th>Módulo</th><th class="num">Movimientos / registros</th><th class="num">Total</th><th>Detalle</th></tr></thead>
    <tbody>
      <tr><td>Entradas de insumos</td><td class="num">${t.entradasMov}</td><td class="num">+${t.entradasUnid} u</td><td>Ingresos del día</td></tr>
      <tr><td>Débitos de insumos</td><td class="num">${t.debitosMov}</td><td class="num">−${t.debitosUnid} u</td><td>${t.pacientes} paciente(s)</td></tr>
      <tr><td>Traslados</td><td class="num">${t.traslados}</td><td class="num">${t.traslados}</td><td>${t.trasCompletados} completados, ${t.trasEnCurso} en curso</td></tr>
      <tr><td>Fallecidos</td><td class="num">${t.fallecidos}</td><td class="num">${t.fallecidos}</td><td>Registrados</td></tr>
      <tr class="tot"><td>Inventario (corte)</td><td class="num">${t.invProductos}</td><td class="num">${t.invUnidades} u</td><td>${t.invCriticos} críticos · ${t.invDeficit} déficit</td></tr>
    </tbody></table>
    <div class="firma"><div>Responsable de guardia</div><div>Coordinador</div></div>`;
  imprimirHTML("Resumen diario " + iso, cuerpo);
}

function exportResumenes() {
  if (!resumenes.length) { toast("Sin cierres guardados", ""); return; }
  const filas = [["Fecha", "Entradas mov", "Entradas u", "Débitos mov", "Débitos u", "Pacientes", "Traslados", "Fallecidos", "Inv. productos", "Inv. unidades", "Críticos", "Déficit", "Guardado por"]];
  resumenes.forEach((r) => filas.push([r.fecha, r.entradasMov ?? 0, r.entradasUnid ?? 0, r.debitosMov ?? 0, r.debitosUnid ?? 0, r.pacientes ?? 0, r.traslados ?? 0, r.fallecidos ?? 0, r.invProductos ?? 0, r.invUnidades ?? 0, r.invCriticos ?? 0, r.invDeficit ?? 0, r.generadoPor || ""]));
  descargarCSV(`resumenes_diarios_${hoyISO()}.csv`, filas);
  toast("Resúmenes exportados", "ok");
}

// =====================================================================
//  ADMINISTRACIÓN DE USUARIOS
// =====================================================================
function renderUsuarios() {
  const tb = $("#tbUsuarios");
  if (!tb) return;
  tb.innerHTML = usuarios.length ? usuarios.map((u) => {
    const activo = u.activo !== false;
    const esYo = u.usuario === usuarioActual;
    return `<tr>
      <td><b>${u.usuario || "—"}</b>${esYo ? ' <span class="hint">(tú)</span>' : ""}</td>
      <td><span class="pill ${u.rol === "admin" ? "mod" : "dep"}">${u.rol === "admin" ? "Administrador" : "Operador"}</span></td>
      <td>${activo ? '<span class="pill ok">Activo</span>' : '<span class="pill bajo">Deshabilitado</span>'}</td>
      <td>${u.creadoPor || "—"}</td>
      <td>${esYo ? '<span class="hint">—</span>' :
        `<button class="btn ${activo ? "peligro" : "gris"} sm" data-toggle-user="${u.id}">${activo ? "Deshabilitar" : "Habilitar"}</button>`}</td>
    </tr>`;
  }).join("") : `<tr><td colspan="5" class="vacio">No hay usuarios registrados.</td></tr>`;
}

async function guardarDocUsuario(uid, datos) {
  await setDoc(doc(db, "usuarios", uid), datos, { merge: true });
}

async function onCrearUsuario(e) {
  e.preventDefault();
  const usuario = $("#nuUsuario").value.trim();
  const pass = $("#nuPass").value;
  const rol = $("#nuRol").value;
  if (!usuario || !pass) { toast("Completa usuario y contraseña", "err"); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const email = emailDeUsuario(usuario);
    const nuevo = await crearUsuarioAislado(email, pass); // no cierra tu sesión
    await guardarDocUsuario(nuevo.uid, {
      uid: nuevo.uid,
      usuario: usuarioDeEmail(email),
      email,
      rol,
      activo: true,
      creadoPor: usuarioActual || "—",
      creadoEn: serverTimestamp(),
    });
    toast("Usuario '" + usuarioDeEmail(email) + "' creado", "ok");
    e.target.reset();
  } catch (err) {
    console.error(err);
    toast(traducirErrorAuth(err.code || err.message), "err");
  } finally { btn.disabled = false; }
}

async function toggleUsuario(uid) {
  const u = usuarios.find((x) => x.id === uid);
  if (!u) return;
  const activo = u.activo !== false;
  if (!confirm(`¿${activo ? "Deshabilitar" : "Habilitar"} al usuario "${u.usuario}"?` + (activo ? " No podrá iniciar sesión." : ""))) return;
  try {
    await updateDoc(doc(db, "usuarios", uid), { activo: !activo });
    toast(activo ? "Usuario deshabilitado" : "Usuario habilitado", "ok");
  } catch (e) { toast("Error: " + e.message, "err"); }
}

async function onCambiarPass(e) {
  e.preventDefault();
  const n1 = $("#cpNueva").value, n2 = $("#cpRepetir").value;
  if (n1.length < 6) { toast("La contraseña debe tener al menos 6 caracteres", "err"); return; }
  if (n1 !== n2) { toast("Las contraseñas no coinciden", "err"); return; }
  try {
    await updatePassword(auth.currentUser, n1);
    toast("Contraseña actualizada", "ok");
    e.target.reset();
  } catch (err) {
    if ((err.code || "").includes("requires-recent-login"))
      toast("Por seguridad, cierra sesión y vuelve a entrar antes de cambiarla.", "err");
    else toast(traducirErrorAuth(err.code || err.message), "err");
  }
}

// =====================================================================
//  TRANSFERENCIAS DE STOCK (entre ubicaciones)
// =====================================================================
function renderTransferencias() {
  const tb = $("#tbTransfer");
  if (!tb) return;
  tb.innerHTML = transferencias.length ? transferencias.map((t) => `
    <tr>
      <td>${fmtFecha(t.fecha)}</td>
      <td><span class="ref-cod">${t.referencia}</span></td>
      <td>${t.productoNombre}</td>
      <td class="num">${t.cantidad}</td>
      <td>${pillUbic(t.origen)}</td>
      <td>${pillUbic(t.destino)}</td>
      <td>${t.responsable || "—"}</td>
    </tr>`).join("") : `<tr><td colspan="7" class="vacio">Sin transferencias registradas.</td></tr>`;
}

async function onSubmitTransfer(e) {
  e.preventDefault();
  const prodId = $("#trfProd").value;
  const cant = parseInt($("#trfCant").value);
  const destino = $("#trfDestino").value;
  if (!prodId) { toast("Selecciona un insumo", "err"); return; }
  if (!cant || cant <= 0) { toast("Cantidad inválida", "err"); return; }
  const origenProd = productos.find((p) => p.id === prodId);
  if (!origenProd) { toast("El insumo ya no existe", "err"); return; }
  const origen = origenProd.ubicacion || "Depósito";
  if (origen === destino) { toast("El origen y el destino son la misma ubicación", "err"); return; }
  if (cant > (origenProd.cantidad || 0)) { toast(`Existencia insuficiente (disponible: ${origenProd.cantidad || 0})`, "err"); return; }

  const referencia = nuevaReferenciaPre("TRF");
  const fechaISO = $("#trfFecha").value || hoyISO();
  const responsable = $("#trfResp").value.trim() || usuarioActual;
  const obs = $("#trfObs").value.trim();
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    // Buscar insumo equivalente en el destino (mismo nombre + unidad)
    let destProd = productos.find((p) => p.id !== prodId &&
      (p.nombre || "").trim().toLowerCase() === (origenProd.nombre || "").trim().toLowerCase() &&
      (p.ubicacion || "Depósito") === destino);

    await runTransaction(db, async (tx) => {
      const oRef = doc(db, "productos", prodId);
      const oSnap = await tx.get(oRef);
      if (!oSnap.exists()) throw new Error("El insumo ya no existe.");
      const oData = oSnap.data();
      if (cant > (oData.cantidad || 0)) throw new Error("Existencia insuficiente.");

      let destRefDoc, destSnapData;
      if (destProd) { destRefDoc = doc(db, "productos", destProd.id); const s = await tx.get(destRefDoc); destSnapData = s.data(); }

      tx.update(oRef, { cantidad: (oData.cantidad || 0) - cant, actualizado: serverTimestamp() });
      if (destProd) {
        tx.update(destRefDoc, { cantidad: (destSnapData.cantidad || 0) + cant, actualizado: serverTimestamp() });
      } else {
        const nuevoRef = doc(collection(db, "productos"));
        tx.set(nuevoRef, {
          nombre: oData.nombre, categoria: oData.categoria || "", unidad: oData.unidad || "unidades",
          ubicacion: destino, cantidad: cant, conteoInicial: 0, minimo: oData.minimo ?? UMBRAL_CRITICO_DEFECTO,
          creado: serverTimestamp(), actualizado: serverTimestamp(),
        });
      }
      const trfRef = doc(collection(db, "transferencias"));
      tx.set(trfRef, {
        referencia, productoNombre: oData.nombre, unidad: oData.unidad || "unidades",
        cantidad: cant, origen, destino, responsable, obs,
        fecha: Timestamp.fromDate(new Date(fechaISO + "T" + new Date().toTimeString().slice(0, 8))),
        creado: serverTimestamp(),
      });
    });
    toast("Transferencia registrada · " + referencia, "ok");
    e.target.reset();
    $("#trfFecha").value = hoyISO();
  } catch (err) { console.error(err); toast("Error: " + err.message, "err"); }
  finally { btn.disabled = false; }
}

function exportTransferencias() {
  if (!transferencias.length) { toast("Sin transferencias", ""); return; }
  const filas = [["Fecha", "Referencia", "Insumo", "Cantidad", "Origen", "Destino", "Responsable", "Observaciones"]];
  transferencias.forEach((t) => filas.push([fmtFecha(t.fecha), t.referencia, t.productoNombre, t.cantidad, t.origen, t.destino, t.responsable || "", t.obs || ""]));
  descargarCSV(`transferencias_${hoyISO()}.csv`, filas);
  toast("Transferencias exportadas", "ok");
}

// =====================================================================
//  PACIENTES (con diagnóstico y expediente)
// =====================================================================
function insumosDePaciente(p) {
  return movimientos.filter((m) => m.tipo === "salida" && (
    (p.id && m.pacienteId === p.id) ||
    (p.cedula && m.paciente?.cedula && m.paciente.cedula === p.cedula)
  ));
}

function renderPacientes() {
  const tb = $("#tbPacientes");
  if (!tb) return;
  const txt = ($("#buscarPac")?.value || "").toLowerCase();
  const lista = pacientes.filter((p) => !txt || `${p.nombre} ${p.cedula || ""}`.toLowerCase().includes(txt));
  tb.innerHTML = lista.length ? lista.map((p) => {
    const n = insumosDePaciente(p).length;
    return `<tr>
      <td><b>${p.nombre}</b>${p.edad ? ` <span class="hint">${p.edad}a</span>` : ""}</td>
      <td>${p.cedula || "—"}</td>
      <td>${(p.diagnostico || "—").slice(0, 60)}${(p.diagnostico || "").length > 60 ? "…" : ""}</td>
      <td class="num">${n}</td>
      <td>
        <button class="btn sec sm" data-exp="${p.id}" title="Expediente">${ico("expediente")}</button>
        <button class="btn gris sm ico-btn" data-edit-pac="${p.id}" title="Editar">${ico("editar")}</button>
        <button class="btn peligro sm ico-btn" data-del-pac="${p.id}" title="Eliminar">${ico("basura")}</button>
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="5" class="vacio">No hay pacientes registrados.</td></tr>`;
}

function limpiarFormPaciente() {
  $("#formPaciente").reset();
  $("#pacId").value = "";
}

async function onSubmitPaciente(e) {
  e.preventDefault();
  const nombre = $("#pacNombre").value.trim();
  if (!nombre) { toast("El nombre es obligatorio", "err"); return; }
  const datos = {
    nombre,
    cedula: $("#pacCedula").value.trim(),
    edad: $("#pacEdad").value ? parseInt($("#pacEdad").value) : null,
    sexo: $("#pacSexo").value,
    telefono: $("#pacTelefono").value.trim(),
    caso: $("#pacCaso").value.trim(),
    diagnostico: $("#pacDiagnostico").value.trim(),
    notas: $("#pacNotas").value.trim(),
    actualizado: serverTimestamp(),
  };
  try {
    const id = $("#pacId").value;
    if (id) { await updateDoc(doc(db, "pacientes", id), datos); toast("Paciente actualizado", "ok"); }
    else { datos.creado = serverTimestamp(); datos.creadoPor = usuarioActual; await addDoc(collection(db, "pacientes"), datos); toast("Paciente registrado", "ok"); }
    limpiarFormPaciente();
  } catch (err) { console.error(err); toast("Error: " + err.message, "err"); }
}

function editarPaciente(id) {
  const p = pacientes.find((x) => x.id === id);
  if (!p) return;
  $("#pacId").value = p.id;
  $("#pacNombre").value = p.nombre || "";
  $("#pacCedula").value = p.cedula || "";
  $("#pacEdad").value = p.edad ?? "";
  $("#pacSexo").value = p.sexo || "";
  $("#pacTelefono").value = p.telefono || "";
  $("#pacCaso").value = p.caso || "";
  $("#pacDiagnostico").value = p.diagnostico || "";
  $("#pacNotas").value = p.notas || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function eliminarPaciente(id) {
  const p = pacientes.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar al paciente "${p.nombre}"? No se borran sus débitos históricos.`)) return;
  try { await deleteDoc(doc(db, "pacientes", id)); toast("Paciente eliminado", "ok"); }
  catch (e) { toast("Error: " + e.message, "err"); }
}

function expedientePaciente(id) {
  const p = pacientes.find((x) => x.id === id);
  if (!p) return;
  const regs = insumosDePaciente(p).sort((a, b) => a.fecha - b.fecha);
  const total = regs.reduce((s, m) => s + m.cantidad, 0);
  const filas = regs.map((m) => `<tr>
    <td>${fmtFecha(m.fecha)}</td><td class="ref">${m.atencion || m.referencia}</td>
    <td>${m.productoNombre}</td><td class="num">${m.cantidad}</td>
    <td>${m.responsable || "—"}</td><td>${m.obs || ""}</td></tr>`).join("");

  const cuerpo = cabeceraReporte("Expediente del paciente", "Emitido: " + fmtFecha(new Date())) + `
    <div class="meta">
      <span><b>Paciente:</b> ${p.nombre}</span>
      <span><b>Cédula:</b> ${p.cedula || "—"}</span>
      <span><b>Edad:</b> ${p.edad ?? "—"}</span>
      <span><b>Sexo:</b> ${p.sexo || "—"}</span>
      <span><b>N.º caso:</b> ${p.caso || "—"}</span>
    </div>
    <h3>Diagnóstico</h3>
    <p>${p.diagnostico ? p.diagnostico.replace(/</g, "&lt;") : "—"}</p>
    ${p.notas ? `<h3>Observaciones</h3><p>${p.notas.replace(/</g, "&lt;")}</p>` : ""}
    <h3>Insumos debitados (${regs.length})</h3>
    ${regs.length ? `<table><thead><tr><th>Fecha</th><th>Atención/Ref.</th><th>Insumo</th><th class="num">Cant.</th><th>Responsable</th><th>Especificaciones</th></tr></thead>
      <tbody>${filas}<tr class="tot"><td colspan="3">TOTAL</td><td class="num">${total}</td><td colspan="2"></td></tr></tbody></table>`
      : `<p>Sin insumos debitados a este paciente.</p>`}
    <div class="firma"><div>Paramédico responsable</div><div>Coordinador</div></div>`;
  imprimirHTML("Expediente " + p.nombre, cuerpo);
}

function exportPacientes() {
  if (!pacientes.length) { toast("Sin pacientes", ""); return; }
  const filas = [["Nombre", "Cédula", "Edad", "Sexo", "Teléfono", "N.º caso", "Diagnóstico", "Insumos debitados"]];
  pacientes.forEach((p) => filas.push([p.nombre, p.cedula || "", p.edad ?? "", p.sexo || "", p.telefono || "", p.caso || "", p.diagnostico || "", insumosDePaciente(p).length]));
  descargarCSV(`pacientes_${hoyISO()}.csv`, filas);
  toast("Pacientes exportados", "ok");
}

// =====================================================================
//  REGISTROS SIMPLES (educación, inspección, actividades, combustible)
// =====================================================================
async function addRegistro(coleccion, datos, nombre, pre) {
  try {
    await addDoc(collection(db, coleccion), {
      ...datos,
      referencia: nuevaReferenciaPre(pre),
      fecha: Timestamp.fromDate(new Date((datos._fechaISO || hoyISO()) + "T" + new Date().toTimeString().slice(0, 8))),
      creadoPor: usuarioActual, creado: serverTimestamp(),
    });
    toast(nombre + " registrado", "ok");
    return true;
  } catch (e) { console.error(e); toast("Error: " + e.message, "err"); return false; }
}
async function delRegistro(coleccion, id) {
  if (!confirm("¿Eliminar este registro?")) return;
  try { await deleteDoc(doc(db, coleccion, id)); toast("Registro eliminado", "ok"); }
  catch (e) { toast("Error: " + e.message, "err"); }
}

// ---- Educación ----
function renderEducacion() {
  const tb = $("#tbEducacion");
  if (!tb) return;
  tb.innerHTML = educacion.length ? educacion.map((r) => `
    <tr>
      <td>${fmtFechaCorta(r.fecha)}</td><td><span class="ref-cod">${r.referencia}</span></td>
      <td>${r.tipo || "—"}</td><td><b>${r.nombre || "—"}</b></td>
      <td class="num">${r.poblacion ?? "—"}</td><td>${r.formacion || "—"}</td>
      <td>${r.simulacro === "si" ? '<span class="pill mod">Simulacro</span>' : "No"}</td>
      <td>${r.responsable || "—"}</td>
      <td><button class="btn peligro sm ico-btn" data-del-edu="${r.id}" title="Eliminar">${ico("basura")}</button></td>
    </tr>`).join("") : `<tr><td colspan="9" class="vacio">Sin registros.</td></tr>`;
}
async function onSubmitEducacion(e) {
  e.preventDefault();
  if (!$("#eduNombre").value.trim()) { toast("Indica el nombre", "err"); return; }
  const ok = await addRegistro("educacion", {
    _fechaISO: $("#eduFecha").value, tipo: $("#eduTipo").value, nombre: $("#eduNombre").value.trim(),
    poblacion: $("#eduPoblacion").value ? parseInt($("#eduPoblacion").value) : null,
    formacion: $("#eduFormacion").value.trim(), simulacro: $("#eduSimulacro").value,
    responsable: $("#eduResp").value.trim(), obs: $("#eduObs").value.trim(),
  }, "Registro de educación", "EDU");
  if (ok) { e.target.reset(); $("#eduFecha").value = hoyISO(); }
}
function exportEducacion() {
  if (!educacion.length) { toast("Sin registros", ""); return; }
  const filas = [["Fecha", "Referencia", "Tipo", "Nombre", "Población", "Formación", "Simulacro", "Responsable", "Observaciones"]];
  educacion.forEach((r) => filas.push([fmtFechaCorta(r.fecha), r.referencia, r.tipo || "", r.nombre || "", r.poblacion ?? "", r.formacion || "", r.simulacro === "si" ? "Sí" : "No", r.responsable || "", r.obs || ""]));
  descargarCSV(`educacion_${hoyISO()}.csv`, filas);
  toast("Registros exportados", "ok");
}
function imprimirEducacion() {
  const filas = educacion.map((r) => `<tr><td>${fmtFechaCorta(r.fecha)}</td><td class="ref">${r.referencia}</td><td>${r.tipo || "—"}</td><td>${r.nombre || "—"}</td><td class="num">${r.poblacion ?? "—"}</td><td>${r.formacion || "—"}</td><td>${r.simulacro === "si" ? "Sí" : "No"}</td><td>${r.responsable || "—"}</td></tr>`).join("");
  const totPob = educacion.reduce((s, r) => s + (r.poblacion || 0), 0);
  const cuerpo = cabeceraReporte("Departamento de Educación", "Registros · " + fmtFecha(new Date())) + `
    <div class="meta"><span><b>Registros:</b> ${educacion.length}</span><span><b>Población alcanzada:</b> ${totPob}</span><span><b>Simulacros:</b> ${educacion.filter(r=>r.simulacro==="si").length}</span></div>
    ${educacion.length ? `<table><thead><tr><th>Fecha</th><th>Ref.</th><th>Tipo</th><th>Nombre</th><th class="num">Población</th><th>Formación</th><th>Simulacro</th><th>Responsable</th></tr></thead><tbody>${filas}</tbody></table>` : "<p>Sin registros.</p>"}
    <div class="firma"><div>Responsable de Educación</div><div>Coordinador</div></div>`;
  imprimirHTML("Departamento de Educación", cuerpo);
}

// ---- Inspecciones ----
function renderInspecciones() {
  const tb = $("#tbInspecciones");
  if (!tb) return;
  tb.innerHTML = inspecciones.length ? inspecciones.map((r) => `
    <tr>
      <td>${fmtFechaCorta(r.fecha)}</td><td><span class="ref-cod">${r.codigo || r.referencia}</span></td>
      <td><b>${r.institucion || "—"}</b></td><td>${r.solicitante || "—"}</td>
      <td>${r.cedulaRif || "—"}</td><td>${r.responsable || "—"}</td>
      <td>
        <button class="btn sec sm" data-print-ins="${r.id}" title="Informe">${ico("ver")}</button>
        <button class="btn peligro sm ico-btn" data-del-ins="${r.id}" title="Eliminar">${ico("basura")}</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="7" class="vacio">Sin inspecciones.</td></tr>`;
}
async function onSubmitInspeccion(e) {
  e.preventDefault();
  if (!$("#insInstitucion").value.trim()) { toast("Indica la institución", "err"); return; }
  const ok = await addRegistro("inspecciones", {
    _fechaISO: $("#insFecha").value, codigo: $("#insCodigo").value.trim(), institucion: $("#insInstitucion").value.trim(),
    solicitante: $("#insSolicitante").value.trim(), cedulaRif: $("#insCedulaRif").value.trim(),
    responsable: $("#insResp").value.trim(), obs: $("#insObs").value.trim(),
  }, "Inspección", "INS");
  if (ok) { e.target.reset(); $("#insFecha").value = hoyISO(); }
}
function imprimirInspeccion(id) {
  const r = inspecciones.find((x) => x.id === id);
  if (!r) return;
  const cuerpo = cabeceraReporte("Inspección técnica", "Fecha: " + fmtFechaCorta(r.fecha)) + `
    <div class="meta"><span><b>Código:</b> ${r.codigo || r.referencia}</span></div>
    <table><tbody>
      <tr><th style="width:35%">Institución</th><td>${r.institucion || "—"}</td></tr>
      <tr><th>Solicitante</th><td>${r.solicitante || "—"}</td></tr>
      <tr><th>Cédula / RIF</th><td>${r.cedulaRif || "—"}</td></tr>
      <tr><th>Responsable</th><td>${r.responsable || "—"}</td></tr>
      <tr><th>Dirección / observaciones</th><td>${(r.obs || "—").replace(/</g, "&lt;")}</td></tr>
    </tbody></table>
    <div class="firma"><div>Inspector</div><div>Coordinador</div></div>`;
  imprimirHTML("Inspección " + (r.codigo || r.referencia), cuerpo);
}
function exportInspecciones() {
  if (!inspecciones.length) { toast("Sin inspecciones", ""); return; }
  const filas = [["Fecha", "Código", "Referencia", "Institución", "Solicitante", "Cédula/RIF", "Responsable", "Observaciones"]];
  inspecciones.forEach((r) => filas.push([fmtFechaCorta(r.fecha), r.codigo || "", r.referencia, r.institucion || "", r.solicitante || "", r.cedulaRif || "", r.responsable || "", r.obs || ""]));
  descargarCSV(`inspecciones_${hoyISO()}.csv`, filas);
  toast("Inspecciones exportadas", "ok");
}

// ---- Actividades ----
function renderActividades() {
  const tb = $("#tbActividades");
  if (!tb) return;
  tb.innerHTML = actividades.length ? actividades.map((r) => `
    <tr>
      <td>${fmtFechaCorta(r.fecha)}</td><td><span class="ref-cod">${r.referencia}</span></td>
      <td>${r.parroquia || "—"}</td><td>${r.lugar || "—"}</td>
      <td><b>${r.actividad || "—"}</b></td><td class="num">${r.poblacion ?? "—"}</td>
      <td>${r.responsable || "—"}</td>
      <td><button class="btn peligro sm ico-btn" data-del-act="${r.id}" title="Eliminar">${ico("basura")}</button></td>
    </tr>`).join("") : `<tr><td colspan="8" class="vacio">Sin actividades.</td></tr>`;
}
async function onSubmitActividad(e) {
  e.preventDefault();
  if (!$("#actActividad").value.trim()) { toast("Indica la actividad", "err"); return; }
  const ok = await addRegistro("actividades", {
    _fechaISO: $("#actFecha").value, parroquia: $("#actParroquia").value.trim(), lugar: $("#actLugar").value.trim(),
    actividad: $("#actActividad").value.trim(), poblacion: $("#actPoblacion").value ? parseInt($("#actPoblacion").value) : null,
    responsable: $("#actResp").value.trim(), obs: $("#actObs").value.trim(),
  }, "Actividad", "ACT");
  if (ok) { e.target.reset(); $("#actFecha").value = hoyISO(); }
}
function exportActividades() {
  if (!actividades.length) { toast("Sin actividades", ""); return; }
  const filas = [["Fecha", "Referencia", "Parroquia", "Lugar", "Actividad", "Población", "Responsable", "Observaciones"]];
  actividades.forEach((r) => filas.push([fmtFechaCorta(r.fecha), r.referencia, r.parroquia || "", r.lugar || "", r.actividad || "", r.poblacion ?? "", r.responsable || "", r.obs || ""]));
  descargarCSV(`actividades_${hoyISO()}.csv`, filas);
  toast("Actividades exportadas", "ok");
}
function imprimirActividades() {
  const filas = actividades.map((r) => `<tr><td>${fmtFechaCorta(r.fecha)}</td><td class="ref">${r.referencia}</td><td>${r.parroquia || "—"}</td><td>${r.lugar || "—"}</td><td>${r.actividad || "—"}</td><td class="num">${r.poblacion ?? "—"}</td><td>${r.responsable || "—"}</td></tr>`).join("");
  const totPob = actividades.reduce((s, r) => s + (r.poblacion || 0), 0);
  const cuerpo = cabeceraReporte("Registro de actividades", "Corte al " + fmtFecha(new Date())) + `
    <div class="meta"><span><b>Actividades:</b> ${actividades.length}</span><span><b>Población total:</b> ${totPob}</span></div>
    ${actividades.length ? `<table><thead><tr><th>Fecha</th><th>Ref.</th><th>Parroquia</th><th>Lugar</th><th>Actividad</th><th class="num">Población</th><th>Responsable</th></tr></thead><tbody>${filas}</tbody></table>` : "<p>Sin actividades.</p>"}
    <div class="firma"><div>Responsable</div><div>Coordinador</div></div>`;
  imprimirHTML("Registro de actividades", cuerpo);
}

// ---- Combustible ----
function renderCombustible() {
  const tb = $("#tbCombustible");
  if (!tb) return;
  tb.innerHTML = combustible.length ? combustible.map((r) => `
    <tr>
      <td>${fmtFechaCorta(r.fecha)}</td><td><span class="ref-cod">${r.referencia}</span></td>
      <td>${r.institucion || "—"}</td><td>${r.tipo || "—"}</td>
      <td class="num">${r.cantidad ?? "—"}</td><td>${r.vehiculo || "—"}</td>
      <td>${r.responsable || "—"}</td>
      <td><button class="btn peligro sm ico-btn" data-del-com="${r.id}" title="Eliminar">${ico("basura")}</button></td>
    </tr>`).join("") : `<tr><td colspan="8" class="vacio">Sin registros.</td></tr>`;
}
async function onSubmitCombustible(e) {
  e.preventDefault();
  const cant = parseFloat($("#comCantidad").value);
  if (!cant || cant <= 0) { toast("Cantidad inválida", "err"); return; }
  const ok = await addRegistro("combustible", {
    _fechaISO: $("#comFecha").value, institucion: $("#comInstitucion").value.trim(), responsable: $("#comResp").value.trim(),
    tipo: $("#comTipo").value, cantidad: cant, vehiculo: $("#comVehiculo").value.trim(), obs: $("#comObs").value.trim(),
  }, "Combustible", "COM");
  if (ok) { e.target.reset(); $("#comFecha").value = hoyISO(); }
}
function exportCombustible() {
  if (!combustible.length) { toast("Sin registros", ""); return; }
  const filas = [["Fecha", "Referencia", "Institución", "Tipo", "Litros", "Vehículo", "Responsable", "Observaciones"]];
  combustible.forEach((r) => filas.push([fmtFechaCorta(r.fecha), r.referencia, r.institucion || "", r.tipo || "", r.cantidad ?? "", r.vehiculo || "", r.responsable || "", r.obs || ""]));
  descargarCSV(`combustible_${hoyISO()}.csv`, filas);
  toast("Registros exportados", "ok");
}
function imprimirCombustible() {
  const filas = combustible.map((r) => `<tr><td>${fmtFechaCorta(r.fecha)}</td><td class="ref">${r.referencia}</td><td>${r.institucion || "—"}</td><td>${r.tipo || "—"}</td><td class="num">${r.cantidad ?? "—"}</td><td>${r.vehiculo || "—"}</td><td>${r.responsable || "—"}</td></tr>`).join("");
  const totG = combustible.filter(r=>r.tipo==="Gasolina").reduce((s,r)=>s+(r.cantidad||0),0);
  const totD = combustible.filter(r=>r.tipo==="Diésel").reduce((s,r)=>s+(r.cantidad||0),0);
  const cuerpo = cabeceraReporte("Registro de combustible", "Corte al " + fmtFecha(new Date())) + `
    <div class="meta"><span><b>Registros:</b> ${combustible.length}</span><span><b>Gasolina:</b> ${totG} L</span><span><b>Diésel:</b> ${totD} L</span></div>
    ${combustible.length ? `<table><thead><tr><th>Fecha</th><th>Ref.</th><th>Institución</th><th>Tipo</th><th class="num">Litros</th><th>Vehículo</th><th>Responsable</th></tr></thead><tbody>${filas}</tbody></table>` : "<p>Sin registros.</p>"}
    <div class="firma"><div>Responsable</div><div>Coordinador</div></div>`;
  imprimirHTML("Registro de combustible", cuerpo);
}

// =====================================================================
//  Comprobantes individuales (entrada / fallecido)
// =====================================================================
function imprimirEntrada(m) {
  const cuerpo = cabeceraReporte("Comprobante de entrada de insumo", "Fecha: " + fmtFecha(m.fecha)) + `
    <div class="meta"><span><b>Referencia:</b> ${m.referencia}</span></div>
    <table><tbody>
      <tr><th style="width:35%">Insumo</th><td>${m.productoNombre}</td></tr>
      <tr><th>Cantidad ingresada</th><td>+${m.cantidad} ${m.unidad || ""}</td></tr>
      <tr><th>Existencia resultante</th><td>${m.existenciaResultante ?? "—"}</td></tr>
      <tr><th>Ubicación</th><td>${m.ubicacion || "—"}</td></tr>
      <tr><th>Origen / proveedor</th><td>${m.origen || "—"}</td></tr>
      <tr><th>Responsable</th><td>${m.responsable || "—"}</td></tr>
      <tr><th>Observaciones</th><td>${(m.obs || "—").replace(/</g, "&lt;")}</td></tr>
    </tbody></table>
    <div class="firma"><div>Recibido por</div><div>Responsable de almacén</div></div>`;
  imprimirHTML("Entrada " + m.referencia, cuerpo);
}

function imprimirFallecido(f) {
  const cuerpo = cabeceraReporte("Informe de fallecido", "Fecha: " + fmtFecha(f.fecha)) + `
    <div class="meta"><span><b>Referencia:</b> ${f.referencia}</span></div>
    <table><tbody>
      <tr><th style="width:35%">Nombre</th><td>${f.nombre || "—"}</td></tr>
      <tr><th>Cédula / identificación</th><td>${f.cedula || "—"}</td></tr>
      <tr><th>Edad</th><td>${f.edad ?? "—"}</td></tr>
      <tr><th>Sexo</th><td>${f.sexo || "—"}</td></tr>
      <tr><th>Lugar del fallecimiento</th><td>${f.lugar || "—"}</td></tr>
      <tr><th>Causa / circunstancia</th><td>${(f.causa || "—").replace(/</g, "&lt;")}</td></tr>
      <tr><th>Destino del cuerpo</th><td>${f.destino || "—"}</td></tr>
      <tr><th>N.º de caso / traslado</th><td>${f.caso || "—"}</td></tr>
      <tr><th>Responsable</th><td>${f.responsable || "—"}</td></tr>
      <tr><th>Observaciones</th><td>${(f.obs || "—").replace(/</g, "&lt;")}</td></tr>
    </tbody></table>
    <div class="firma"><div>Funcionario responsable</div><div>Coordinador</div></div>`;
  imprimirHTML("Informe fallecido " + (f.nombre || f.referencia), cuerpo);
}

// =====================================================================
//  Navegación por pestañas
// =====================================================================
function irA(sec) {
  const botones = $$("nav.tabs button");
  botones.forEach((b) => b.classList.toggle("activo", b.dataset.sec === sec));
  $$(".seccion").forEach((s) => s.classList.toggle("activa", s.id === "sec-" + sec));
  const activo = botones.find((b) => b.dataset.sec === sec);
  if (activo) {
    const etq = activo.querySelector("span:not(.tab-ico):not(.badge)");
    if (etq) $("#topbarTitulo").textContent = etq.textContent;
  }
  cerrarSidebar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function abrirSidebar() { $("#sidebar").classList.add("abierto"); $("#sideBackdrop").classList.add("abierto"); }
function cerrarSidebar() { $("#sidebar").classList.remove("abierto"); $("#sideBackdrop").classList.remove("abierto"); }

// =====================================================================
//  Eventos
// =====================================================================
function inicializarEventos() {
  // Tabs
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sec]");
    if (b) irA(b.dataset.sec);
  });
  document.body.addEventListener("click", (e) => {
    const g = e.target.closest("[data-goto]");
    if (g) irA(g.dataset.goto);
  });

  // Panel lateral (móvil)
  $("#sideToggle").onclick = abrirSidebar;
  $("#sideBackdrop").onclick = cerrarSidebar;

  // Fechas por defecto
  $("#entFecha").value = hoyISO();
  $("#debFecha").value = hoyISO();
  $("#repFecha").value = hoyISO();

  // Inventario
  $("#btnNuevoProd").onclick = () => abrirModalProd();
  $("#btnExportInv").onclick = exportInventario;
  $("#btnExportInv2").onclick = exportInventario;
  $("#buscarInv").oninput = renderInventario;
  $("#filtroUbic").onchange = renderInventario;
  $("#filtroEstado").onchange = renderInventario;
  $("#tbInventario").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-editar]");
    const el = e.target.closest("[data-eliminar]");
    if (ed) abrirModalProd(productos.find((p) => p.id === ed.dataset.editar));
    if (el) eliminarProd(el.dataset.eliminar);
  });

  // Modal producto
  $$("[data-cerrar]").forEach((b) => (b.onclick = cerrarModalProd));
  $("#modalProd").addEventListener("click", (e) => { if (e.target.id === "modalProd") cerrarModalProd(); });
  $("#btnGuardarProd").onclick = guardarProd;
  $("#formProd").addEventListener("submit", (e) => { e.preventDefault(); guardarProd(); });

  // Entradas
  $("#formEntrada").addEventListener("submit", onSubmitEntrada);
  $("#btnExportEntradas").onclick = exportEntradas;

  // Débitos
  $("#formDebito").addEventListener("submit", onSubmitDebito);
  $("#debMotivo").onchange = aplicarVisibilidadPaciente;
  $("#filtroDebFecha").onchange = renderDebitos;
  $("#btnExportDebitos").onclick = exportDebitos;
  $("#btnAgregarLinea").onclick = agregarLineaDebito;
  resetLineasDebito();
  aplicarVisibilidadPaciente();

  // Crítico
  $("#btnExportCritico").onclick = exportCritico;
  $("#btnImprimirCritico").onclick = imprimirCritico;

  // Traslados
  $("#trasFecha").value = hoyISO();
  $("#formTraslado").addEventListener("submit", onSubmitTraslado);
  $("#filtroTrasFecha").onchange = renderTraslados;
  $("#btnExportTraslados").onclick = exportTraslados;
  $("#btnImprimirTraslados").onclick = imprimirTraslados;
  $("#tbTraslados").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-tras]");
    if (b) eliminarTraslado(b.dataset.delTras);
  });

  // Fallecidos
  $("#formFallecido").addEventListener("submit", onSubmitFallecido);
  $("#btnExportFallecidos").onclick = exportFallecidos;
  $("#btnImprimirFallecidos").onclick = imprimirFallecidos;
  $("#tbFallecidos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-fall]");
    if (b) eliminarFallecido(b.dataset.delFall);
  });

  // Resumen diario
  $("#btnGuardarCierre").onclick = guardarCierre;
  $("#btnImprimirResumenHoy").onclick = () => imprimirResumen(hoyISO(), totalesDelDia(hoyISO()));
  $("#btnExportResumenes").onclick = exportResumenes;
  $("#tbResumenes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-print-res]");
    if (b) { const r = resumenes.find((x) => x.id === b.dataset.printRes); if (r) imprimirResumen(r.id, r); }
  });

  // Débito: selección de paciente registrado
  $("#debPacienteSel").onchange = aplicarPacienteSeleccionado;

  // Entradas / Fallecidos: comprobantes individuales
  $("#tbEntradas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ver-ent]");
    if (b) { const m = movimientos.find((x) => x.id === b.dataset.verEnt); if (m) imprimirEntrada(m); }
  });
  $("#tbFallecidos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-print-fall]");
    if (b) { const f = fallecidos.find((x) => x.id === b.dataset.printFall); if (f) imprimirFallecido(f); }
  });

  // Transferencias
  $("#trfFecha").value = hoyISO();
  $("#formTransfer").addEventListener("submit", onSubmitTransfer);
  $("#btnExportTransfer").onclick = exportTransferencias;

  // Pacientes
  $("#formPaciente").addEventListener("submit", onSubmitPaciente);
  $("#btnLimpiarPac").onclick = limpiarFormPaciente;
  $("#buscarPac").oninput = renderPacientes;
  $("#btnExportPacientes").onclick = exportPacientes;
  $("#tbPacientes").addEventListener("click", (e) => {
    const exp = e.target.closest("[data-exp]");
    const ed = e.target.closest("[data-edit-pac]");
    const el = e.target.closest("[data-del-pac]");
    if (exp) expedientePaciente(exp.dataset.exp);
    if (ed) editarPaciente(ed.dataset.editPac);
    if (el) eliminarPaciente(el.dataset.delPac);
  });

  // Educación
  $("#eduFecha").value = hoyISO();
  $("#formEducacion").addEventListener("submit", onSubmitEducacion);
  $("#btnExportEducacion").onclick = exportEducacion;
  $("#btnImprimirEducacion").onclick = imprimirEducacion;
  $("#tbEducacion").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-edu]"); if (b) delRegistro("educacion", b.dataset.delEdu);
  });

  // Inspecciones
  $("#insFecha").value = hoyISO();
  $("#formInspeccion").addEventListener("submit", onSubmitInspeccion);
  $("#btnExportInspecciones").onclick = exportInspecciones;
  $("#tbInspecciones").addEventListener("click", (e) => {
    const pr = e.target.closest("[data-print-ins]");
    const dl = e.target.closest("[data-del-ins]");
    if (pr) imprimirInspeccion(pr.dataset.printIns);
    if (dl) delRegistro("inspecciones", dl.dataset.delIns);
  });

  // Actividades
  $("#actFecha").value = hoyISO();
  $("#formActividad").addEventListener("submit", onSubmitActividad);
  $("#btnExportActividades").onclick = exportActividades;
  $("#btnImprimirActividades").onclick = imprimirActividades;
  $("#tbActividades").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-act]"); if (b) delRegistro("actividades", b.dataset.delAct);
  });

  // Combustible
  $("#comFecha").value = hoyISO();
  $("#formCombustible").addEventListener("submit", onSubmitCombustible);
  $("#btnExportCombustible").onclick = exportCombustible;
  $("#btnImprimirCombustible").onclick = imprimirCombustible;
  $("#tbCombustible").addEventListener("click", (e) => {
    const b = e.target.closest("[data-del-com]"); if (b) delRegistro("combustible", b.dataset.delCom);
  });

  // Usuarios
  $("#formCrearUsuario").addEventListener("submit", onCrearUsuario);
  $("#formCambiarPass").addEventListener("submit", onCambiarPass);
  $("#tbUsuarios").addEventListener("click", (e) => {
    const b = e.target.closest("[data-toggle-user]");
    if (b) toggleUsuario(b.dataset.toggleUser);
  });

  // Reportes
  $("#btnRepDiario").onclick = reporteDiario;
  $("#btnRepPaciente").onclick = reportePaciente;
  $("#btnRepInventario").onclick = reporteInventario;

  // Cerrar modal con Escape
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModalProd(); });
}

// =====================================================================
//  Autenticación
// =====================================================================
let escuchasIniciadas = false;

function traducirErrorAuth(code) {
  const m = {
    "auth/invalid-credential": "Usuario o contraseña incorrectos.",
    "auth/wrong-password": "Usuario o contraseña incorrectos.",
    "auth/user-not-found": "El usuario no existe.",
    "auth/invalid-email": "Usuario no válido.",
    "auth/email-already-in-use": "Ese usuario ya existe.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
    "auth/network-request-failed": "Sin conexión a internet.",
    "auth/operation-not-allowed": "Habilita el proveedor Correo/Contraseña en Firebase Console.",
  };
  return m[code] || ("Error: " + code);
}

function inicializarEventosAuth() {
  const $login = $("#formLogin"), $reg = $("#formRegistro");

  $("#toRegistro").onclick = () => { $login.style.display = "none"; $reg.style.display = "flex"; $("#registroMsg").textContent = ""; };
  $("#toLogin").onclick = () => { $reg.style.display = "none"; $login.style.display = "flex"; $("#loginMsg").textContent = ""; };

  $login.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#loginMsg"); msg.className = "login-msg"; msg.textContent = "";
    const u = $("#logUsuario").value.trim();
    const p = $("#logPass").value;
    if (!u || !p) return;
    $("#btnLogin").disabled = true; $("#btnLogin").textContent = "Ingresando…";
    try {
      await signInWithEmailAndPassword(auth, emailDeUsuario(u), p);
    } catch (err) {
      msg.className = "login-msg err"; msg.textContent = traducirErrorAuth(err.code || err.message);
    } finally {
      $("#btnLogin").disabled = false; $("#btnLogin").textContent = "Iniciar sesión";
    }
  });

  $reg.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#registroMsg"); msg.className = "login-msg"; msg.textContent = "";
    const u = $("#regUsuario").value.trim();
    const p = $("#regPass").value;
    const cod = $("#regCodigo").value;
    if (!u || !p) { msg.className = "login-msg err"; msg.textContent = "Completa usuario y contraseña."; return; }
    if (cod !== CODIGO_REGISTRO) { msg.className = "login-msg err"; msg.textContent = "Código de registro incorrecto."; return; }
    $("#btnRegistro").disabled = true; $("#btnRegistro").textContent = "Creando…";
    try {
      await createUserWithEmailAndPassword(auth, emailDeUsuario(u), p);
      msg.className = "login-msg ok"; msg.textContent = "Usuario creado. Ingresando…";
      // createUser deja la sesión iniciada automáticamente
    } catch (err) {
      msg.className = "login-msg err"; msg.textContent = traducirErrorAuth(err.code || err.message);
    } finally {
      $("#btnRegistro").disabled = false; $("#btnRegistro").textContent = "Crear usuario";
    }
  });

  $("#btnLogout").onclick = async () => {
    if (!confirm("¿Cerrar sesión?")) return;
    await signOut(auth);
  };
}

function mostrarApp(user) {
  usuarioActual = usuarioDeEmail(user.email);
  $("#loginOverlay").style.display = "none";
  $("#userBox").style.display = "flex";
  $("#userNombre").textContent = usuarioActual;
  $("#tabUsuarios").style.display = rolActual === "admin" ? "" : "none";
  if (!escuchasIniciadas) { iniciarEscuchas(); escuchasIniciadas = true; }
}

async function manejarSesion(user) {
  if (!user) { rolActual = ""; usuarioActual = ""; mostrarLogin(); return; }
  try {
    const uref = doc(db, "usuarios", user.uid);
    const snap = await getDoc(uref);
    let udata;
    if (!snap.exists()) {
      // Primer usuario / sin registro: se crea como administrador (bootstrap).
      udata = { uid: user.uid, usuario: usuarioDeEmail(user.email), email: user.email, rol: "admin", activo: true, creadoPor: "(inicial)", creadoEn: serverTimestamp() };
      await setDoc(uref, udata);
    } else {
      udata = snap.data();
    }
    if (udata.activo === false) {
      await signOut(auth);
      mostrarLogin();
      const m = $("#loginMsg"); m.className = "login-msg err"; m.textContent = "Usuario deshabilitado. Contacta al administrador.";
      return;
    }
    rolActual = udata.rol || "operador";
    mostrarApp(user);
  } catch (err) {
    console.error(err);
    rolActual = "admin"; // ante fallo de lectura, no bloquear el acceso
    mostrarApp(user);
  }
}

function mostrarLogin() {
  $("#loginOverlay").style.display = "flex";
  $("#userBox").style.display = "none";
  $("#formRegistro").style.display = "none";
  $("#formLogin").style.display = "flex";
  $("#formLogin").reset(); $("#formRegistro").reset();
  $("#loginMsg").textContent = "";
}

// =====================================================================
//  Arranque
// =====================================================================
pintarIconos();
inicializarEventos();
inicializarEventosAuth();
onAuthStateChanged(auth, (user) => { manejarSesion(user); });
