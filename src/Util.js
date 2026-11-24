/**
 * Util.js — helpers generales: seguridad, fechas, números, hash, escape HTML.
 * Todas las funciones son privadas (terminan en _).
 */

var ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

// ---------------------------------------------------------------------------
// Seguridad
// ---------------------------------------------------------------------------

/**
 * Corta si quien ejecuta no es la cuenta dueña del script.
 * Va al principio de toda función pública "de editor" (sin _): la web app corre como la
 * cuenta dueña y cualquier usuario del dominio podría invocarla con google.script.run.
 */
function exigirDueno_() {
  var activo = (Session.getActiveUser().getEmail() || '').toLowerCase();
  var dueno = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!activo || activo !== dueno) {
    throw new Error('Solo la cuenta dueña del sistema puede ejecutar esta función.');
  }
}

/**
 * Mail del usuario de la web app. Exige que sea del dominio de la empresa.
 * (Con "Ejecutar como: Yo" y acceso de dominio, Google devuelve el mail del visitante.)
 */
function usuarioActual_() {
  var email = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email || email.split('@')[1] !== CONFIG.dominio) {
    throw new Error('Tenés que entrar con tu cuenta de ' + CONFIG.dominio + '.');
  }
  return email;
}

// ---------------------------------------------------------------------------
// Fechas y números
// ---------------------------------------------------------------------------

/**
 * Normaliza una fecha a 'yyyy-MM-dd' en la zona de Argentina.
 * Acepta Date o string 'yyyy-MM-dd'. Devuelve '' si no es válida.
 */
function fechaClave_(valor) {
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return '';
    return Utilities.formatDate(valor, ZONA_HORARIA, 'yyyy-MM-dd');
  }
  var s = String(valor || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Rechaza fechas que "se corren" (31/02 → 03/03).
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return '';
  return s;
}

/** 'yyyy-MM-dd' → 'dd/MM/yyyy' para mostrar. */
function fechaVisible_(valor) {
  var c = fechaClave_(valor);
  if (!c) return '';
  var p = c.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

/** Hoy como 'yyyy-MM-dd' en Argentina. */
function hoyClave_() {
  return fechaClave_(new Date());
}

/** Días entre dos fechas 'yyyy-MM-dd' (b - a). */
function diasEntre_(a, b) {
  var pa = a.split('-').map(Number);
  var pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/** Redondeo decimal sin errores de coma flotante típicos (1.005 → 1.01). */
function redondear_(n, decimales) {
  var f = Math.pow(10, decimales);
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
}

/** Formato km para mostrar: 1234.56 → "1.234,6 km". */
function formatoKm_(n) {
  return formatoNumero_(redondear_(n, 1), 1) + ' km';
}

/** Número con separador de miles "." y decimal ",". */
function formatoNumero_(n, decimales) {
  var partes = Number(n).toFixed(decimales).split('.');
  var entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales > 0 ? entero + ',' + partes[1] : entero;
}

/** Convierte a número aceptando coma decimal ("123,45"). Devuelve NaN si no se puede. */
function aNumero_(v) {
  if (typeof v === 'number') return v;
  var s = String(v === null || v === undefined ? '' : v).trim();
  if (s === '') return NaN;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

/** Texto recortado y sin saltos de línea raros. */
function textoLimpio_(v, max) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Escapa texto para meterlo en HTML (PDF). */
function escaparHtml_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Hash SHA-256 en hexadecimal (para claves de cache). */
function hash_(texto) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
