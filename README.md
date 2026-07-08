# Gestión y Control de Insumos · Protección Civil Venezuela

Aplicación web para administrar los insumos de **Protección Civil y Administración de Desastres (Venezuela)**: inventario, entradas, débitos por paciente, alertas de nivel crítico y reportes imprimibles. Los datos se almacenan en **Cloud Firestore**.

## Funcionalidades

| Módulo | Descripción |
|--------|-------------|
| **Resumen** | Totales de inventario, unidades por ubicación, alertas de crítico y déficit, y últimos movimientos. |
| **Inventario total** | Alta / edición / baja de insumos con categoría, unidad, **ubicación** (Depósito, Módulo, Oficina), existencia, conteo inicial y mínimo. Exportable a CSV. |
| **Entradas** | Registro de ingresos con **fecha, origen/proveedor y responsable**. Cada entrada genera una **referencia** (`ENT-…`) e incrementa la existencia de forma atómica. |
| **Débitos por paciente** | Salida de insumos por **uso en paciente** (nombre, cédula, N.º de caso, especificaciones) o por **extracción directa**. Cada gasto genera una **referencia** (`REF-…`) y descuenta la existencia. |
| **Conteo crítico** | Lista de insumos por debajo de **100 unidades** (o del mínimo definido por insumo). Descargable en **CSV** e imprimible. |
| **Alertas de déficit** | Compara la existencia actual contra el **conteo inicial** y avisa cuando hay faltantes. |
| **Reportes imprimibles** | Documento **diario general** (entradas + débitos con totales), **por paciente** (historial de insumos) e **inventario total**, todos con el membrete institucional listos para imprimir/PDF. |

Cada movimiento (entrada o débito) queda registrado con su referencia, fecha, insumo, cantidad, existencia resultante y responsable. Las existencias se actualizan mediante **transacciones de Firestore**, evitando descuentos por debajo de cero.

## Estructura

```
├── index.html               # Interfaz (pestañas)
├── css/styles.css           # Estilos
├── js/firebase-init.js      # Configuración e inicialización de Firebase
├── js/app.js                # Lógica: CRUD, movimientos, CSV, reportes
├── assets/logo.png          # Logo institucional
├── firebase.json            # Hosting + Firestore
├── firestore.rules          # Reglas de seguridad
├── firestore.indexes.json   # Índices
└── .firebaserc              # Proyecto (braianmodulopc)
```

## Modelo de datos (Firestore)

**`productos`**
```
nombre, categoria, unidad, ubicacion ("Depósito"|"Módulo"|"Oficina"),
cantidad, conteoInicial, minimo (def. 100), creado, actualizado
```

**`movimientos`**
```
tipo ("entrada"|"salida"), referencia, productoId, productoNombre, unidad,
categoria, cantidad, ubicacion, existenciaResultante, fecha,
motivo ("paciente"|"extraccion"), paciente {nombre, cedula, caso},
origen, responsable, obs, creado
```

## Uso local

La app es 100 % estática. Para probarla necesitas servirla por HTTP (los módulos ES no cargan con `file://`):

```bash
# Opción 1: Python
python3 -m http.server 5000
# luego abre http://localhost:5000

# Opción 2: Firebase CLI
npm install -g firebase-tools
firebase emulators:start --only hosting
```

## Despliegue en Firebase Hosting

```bash
firebase login
firebase deploy --only hosting
# Reglas de Firestore:
firebase deploy --only firestore:rules
```

La app quedará publicada en `https://braianmodulopc.web.app`.

## Seguridad

Las reglas incluidas (`firestore.rules`) están en **modo abierto** para que la app funcione de inmediato. **Antes de usar en producción** activa *Firebase Authentication* y aplica el bloque `PRODUCCIÓN` comentado en `firestore.rules` para exigir usuarios autenticados y bloquear la edición/borrado de movimientos históricos.
