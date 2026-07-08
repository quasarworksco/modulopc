// =====================================================================
//  Gestión y Control de Insumos · Protección Civil Venezuela
//  Lógica principal de la aplicación (Firestore)
// =====================================================================
import {
  db, collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, runTransaction, serverTimestamp, Timestamp,
} from "./firebase-init.js";

const UMBRAL_CRITICO_DEFECTO = 100;

// Estado en memoria (sincronizado en tiempo real con Firestore)
let productos = [];        // [{id, nombre, categoria, unidad, cantidad, conteoInicial, minimo, ubicacion}]
let movimientos = [];      // [{id, tipo, referencia, productoId, productoNombre, unidad, cantidad, ubicacion, fecha(Date), motivo, paciente{}, origen, responsable, obs}]
let traslados = [];        // [{id, referencia, fecha(Date), tipo, estado, paciente, cedula, unidad, origen, destino, responsable, obs}]
let fallecidos = [];       // [{id, referencia, fecha(Date), nombre, cedula, edad, sexo, lugar, causa, destino, caso, responsable, obs}]

// =====================================================================
//  Utilidades
// =====================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

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
    html += `<div class="alert-box rojo"><span>⚠️</span><div><b>${criticos.length} insumo(s) en nivel crítico</b> (por debajo del mínimo). Revisa la pestaña <b>Conteo crítico</b> para reabastecer.</div></div>`;
  }
  if (deficits.length) {
    html += `<div class="alert-box amar"><span>📉</span><div><b>${deficits.length} insumo(s) con déficit</b> respecto a su conteo inicial. Verifica posibles faltantes o consumos no registrados.</div></div>`;
  }
  if (!criticos.length && !deficits.length && productos.length) {
    html += `<div class="alert-box verde"><span>✅</span><div>Todos los insumos están por encima de su nivel mínimo y de su conteo inicial.</div></div>`;
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
        <button class="btn gris sm" data-editar="${p.id}">✏️</button>
        <button class="btn peligro sm" data-eliminar="${p.id}">🗑️</button>
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
    </tr>`).join("") : `<tr><td colspan="6" class="vacio">Sin entradas registradas.</td></tr>`;
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
      <td>${m.productoNombre}</td>
      <td class="num">−${m.cantidad}</td>
      <td>${m.motivo === "paciente" ? "Paciente" : "Extracción directa"}</td>
      <td>${m.paciente?.nombre ? `${m.paciente.nombre}${m.paciente.cedula ? " ("+m.paciente.cedula+")" : ""}` : "—"}</td>
      <td>${m.responsable || "—"}</td>
    </tr>`).join("") : `<tr><td colspan="7" class="vacio">Sin débitos registrados.</td></tr>`;
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
    ? `<div class="alert-box rojo"><span>⚠️</span><div><b>${lista.length} insumo(s)</b> requieren reabastecimiento inmediato.</div></div>`
    : `<div class="alert-box verde"><span>✅</span><div>No hay insumos en nivel crítico.</div></div>`;

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
  }).join("") : `<tr><td colspan="6" class="vacio">Sin insumos críticos. 🎉</td></tr>`;
}

// =====================================================================
//  Selects de productos y categorías
// =====================================================================
function llenarSelectsProductos() {
  const opts = `<option value="">— Selecciona un insumo —</option>` +
    productos.map((p) => `<option value="${p.id}">${p.nombre} (${(p.cantidad||0)} ${p.unidad||"u"} · ${p.ubicacion||"Depósito"})</option>`).join("");
  for (const id of ["#entProd", "#debProd"]) {
    const sel = $(id);
    if (sel) { const v = sel.value; sel.innerHTML = opts; sel.value = v; }
  }
}
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
  const productoId = $("#debProd").value;
  const cantidad = parseInt($("#debCant").value);
  const motivo = $("#debMotivo").value;
  if (!productoId) { toast("Selecciona un insumo", "err"); return; }
  if (!cantidad || cantidad <= 0) { toast("Cantidad inválida", "err"); return; }

  let paciente = null;
  if (motivo === "paciente") {
    const nombre = $("#debPacNombre").value.trim();
    if (!nombre) { toast("Indica el nombre del paciente", "err"); return; }
    paciente = {
      nombre,
      cedula: $("#debPacCedula").value.trim(),
      caso: $("#debPacCaso").value.trim(),
    };
  }
  try {
    const ref = await registrarMovimiento({
      tipo: "salida",
      productoId, cantidad, motivo, paciente,
      fechaISO: $("#debFecha").value || hoyISO(),
      responsable: $("#debResp").value.trim(),
      obs: $("#debObs").value.trim(),
    });
    toast("Débito registrado · " + ref, "ok");
    e.target.reset();
    $("#debFecha").value = hoyISO();
    aplicarVisibilidadPaciente();
  } catch (err) { console.error(err); toast("Error: " + err.message, "err"); }
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
  const filas = [["Fecha", "Referencia", "Insumo", "Cantidad", "Unidad", "Motivo", "Paciente", "Cédula", "N.º caso", "Responsable", "Especificaciones"]];
  deb.forEach((m) => filas.push([
    fmtFecha(m.fecha), m.referencia, m.productoNombre, m.cantidad, m.unidad || "",
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
    <button onclick="window.print()" style="padding:10px 22px;background:#e8730c;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer">🖨️ Imprimir</button>
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
    <td class="ref">${m.referencia}</td>
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
    <table><thead><tr><th>Fecha</th><th>Referencia</th><th>Insumo</th><th class="num">Cant.</th><th>Unidad</th><th>Responsable</th><th>Especificaciones</th></tr></thead>
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
      <td><button class="btn peligro sm" data-del-tras="${t.id}">🗑️</button></td>
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
      <td><button class="btn peligro sm" data-del-fall="${f.id}">🗑️</button></td>
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
//  Navegación por pestañas
// =====================================================================
function irA(sec) {
  $$("nav.tabs button").forEach((b) => b.classList.toggle("activo", b.dataset.sec === sec));
  $$(".seccion").forEach((s) => s.classList.toggle("activa", s.id === "sec-" + sec));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

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

  // Reportes
  $("#btnRepDiario").onclick = reporteDiario;
  $("#btnRepPaciente").onclick = reportePaciente;
  $("#btnRepInventario").onclick = reporteInventario;

  // Cerrar modal con Escape
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModalProd(); });
}

// =====================================================================
//  Arranque
// =====================================================================
inicializarEventos();
iniciarEscuchas();
