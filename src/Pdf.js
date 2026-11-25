/**
 * Pdf.js — arma el PDF del día: todas las salidas del empleado, con tramos, km y mapa.
 */

/**
 * Valida el día que manda el cliente y recalcula todas las rutas en el servidor.
 * @param {{fecha: string, nombre: string, salidas: {motivo: string, paradas: Object[]}[]}} dia
 * @param {string} email mail del usuario (sale de la sesión, nunca del cliente)
 * @return {Object} día listo para el PDF
 */
function prepararDia_(dia, email) {
  var c = obtenerConfig_();
  dia = dia || {};

  var fecha = fechaClave_(dia.fecha);
  if (!fecha) throw new Error('La fecha no es válida.');
  var hoy = hoyClave_();
  if (fecha > hoy) throw new Error('No se pueden cargar recorridos de días futuros.');
  if (diasEntre_(fecha, hoy) > c.diasAtrasPermitidos) {
    throw new Error('Solo se pueden armar recorridos de los últimos ' + c.diasAtrasPermitidos + ' días.');
  }

  var nombre = textoLimpio_(dia.nombre, 80);
  if (nombre.length < 3) throw new Error('Escribí tu nombre y apellido.');

  var salidas = Array.isArray(dia.salidas) ? dia.salidas : [];
  if (salidas.length === 0) throw new Error('Cargá al menos una salida.');
  if (salidas.length > c.maxSalidasPorDia) {
    throw new Error('Como máximo se pueden cargar ' + c.maxSalidasPorDia + ' salidas por día.');
  }

  var kmTotal = 0;
  var calculadas = salidas.map(function (s, i) {
    var ruta;
    try {
      ruta = calcularRuta_(s && s.paradas, { conMapa: true });
    } catch (e) {
      throw new Error('Salida ' + (i + 1) + ': ' + e.message);
    }
    kmTotal += ruta.km;
    return {
      numero: i + 1,
      motivo: textoLimpio_(s.motivo, 200),
      km: ruta.km,
      duracionMin: ruta.duracionMin,
      paradas: ruta.paradas,
      legs: ruta.legs,
      linkMapa: ruta.linkMapa,
      mapaBase64: ruta.mapaBase64,
      mapaTipo: ruta.mapaTipo
    };
  });

  return {
    fecha: fecha,
    nombre: nombre,
    email: email,
    salidas: calculadas,
    kmTotal: redondear_(kmTotal, 1),
    generado: Utilities.formatDate(new Date(), ZONA_HORARIA, 'dd/MM/yyyy HH:mm')
  };
}

/** Genera el PDF y devuelve {nombreArchivo, base64, kmTotal}. */
function generarPdfDia_(diaPreparado) {
  var html = htmlPdf_(diaPreparado, logoDataUri_());
  var nombreArchivo = 'Recorridos_' + diaPreparado.fecha + '_' + diaPreparado.email.split('@')[0] + '.pdf';
  var pdf = Utilities.newBlob(html, 'text/html', 'recorridos.html').getAs('application/pdf').setName(nombreArchivo);
  return {
    nombreArchivo: nombreArchivo,
    base64: Utilities.base64Encode(pdf.getBytes()),
    kmTotal: diaPreparado.kmTotal
  };
}

/** Logo publicado junto con la página de bienvenida (Cloudflare Pages). */
var LOGO_URL = 'https://viaticos.proyectonorte.com.ar/logo-proyecto-norte.png';

/**
 * Logo como data URI, o '' si no se puede leer.
 * Usa LOGO_FILE_ID (Drive) si está cargado; si no, el logo publicado en LOGO_URL (cacheado 6 h).
 */
function logoDataUri_() {
  var id = obtenerConfig_().logoFileId;
  if (id) {
    try {
      var blob = DriveApp.getFileById(id).getBlob();
      return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (e) {
      console.error('Logo (Drive): ' + e.message);
    }
  }
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('logo-pdf');
  if (guardado) return guardado;
  try {
    var resp = UrlFetchApp.fetch(LOGO_URL, { muteHttpExceptions: true });
    var tipo = String(resp.getHeaders()['Content-Type'] || resp.getHeaders()['content-type'] || '');
    if (resp.getResponseCode() !== 200 || tipo.indexOf('image/') !== 0) return '';
    var uri = 'data:' + tipo.split(';')[0] + ';base64,' + Utilities.base64Encode(resp.getContent());
    try { cache.put('logo-pdf', uri, CACHE_SEGUNDOS); } catch (e) { /* no crítico */ }
    return uri;
  } catch (e) {
    console.error('Logo (web): ' + e.message);
    return '';
  }
}

/**
 * HTML del PDF (lógica pura: testeable sin Google).
 * El conversor de Apps Script soporta CSS simple: tablas, bordes, colores, page-break.
 */
function htmlPdf_(d, logoUri) {
  var e = escaparHtml_;
  var oficina = CONFIG.oficina.nombre;
  var partes = [];

  // Estética Proyecto Norte. Solo CSS simple: el conversor de Apps Script no carga fuentes web ni filtros
  // y descarta los colores de fondo, así que todo se resuelve con texto oscuro y bordes.
  partes.push(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:14mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#2a2a2a}' +
    'table{border-collapse:collapse;width:100%}' +
    '.cab td{vertical-align:middle;padding:0}' +
    '.cab .marca{font-size:13pt;letter-spacing:1px;color:#2a2a2a}' +
    '.cab .tit{text-align:right}' +
    '.k{font-size:7.5pt;letter-spacing:2px;text-transform:uppercase;color:#69727d}' +
    '.t{font-size:15pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin:2px 0}' +
    '.raya{border-top:3px solid #d7191f;margin:10px 0 14px}' +
    '.datos td{padding:4px 0;vertical-align:top;border-bottom:1px solid #f0f0f1}' +
    '.datos td.et{width:30%;font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;color:#69727d;padding-top:6px}' +
    '.total{margin:16px 0 4px;padding:10px 16px;color:#2a2a2a;border:1px solid #dcdde0;border-left:6px solid #d7191f}' +
    '.total b{font-size:20pt;letter-spacing:.5px}' +
    'h2{font-size:10.5pt;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;padding-left:8px;border-left:4px solid #d7191f}' +
    'h2 span{font-weight:normal;letter-spacing:.5px;text-transform:none;color:#69727d}' +
    '.tramos th{color:#2a2a2a;font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;padding:6px;text-align:left;border-bottom:2px solid #2a2a2a}' +
    '.tramos td{border-bottom:1px solid #dcdde0;padding:6px;text-align:left;vertical-align:top}' +
    '.tramos td.km,.tramos th.km{text-align:right;white-space:nowrap}' +
    '.tramos tr.tot td{font-weight:bold;border-bottom:none;border-top:2px solid #2a2a2a}' +
    '.salida{margin-top:20px;page-break-inside:avoid}' +
    '.mapa{margin-top:8px;width:100%;max-width:640px;border:1px solid #dcdde0}' +
    '.sub{color:#69727d;font-size:8.5pt}' +
    '.pie{margin-top:22px;color:#69727d;font-size:7.5pt;line-height:1.4;border-top:1px solid #dcdde0;padding-top:8px}' +
    '.pie b{color:#2a2a2a;letter-spacing:1px;text-transform:uppercase}' +
    'a{color:#2a2a2a}' +
    '</style></head><body>'
  );

  // Encabezado: logo a color sobre blanco (como en proyectonorte.com.ar) y título a la derecha.
  partes.push('<table class="cab"><tr>' +
    '<td class="marca">' + (logoUri
      ? '<img src="' + logoUri + '" style="height:46px">'
      : 'PROYECTO <b>NORTE</b>') + '</td>' +
    '<td class="tit"><div class="k">Viáticos por km</div><div class="t">Detalle de recorridos</div>' +
    '<div class="k">en auto particular</div></td></tr></table><div class="raya"></div>');

  partes.push('<table class="datos">' +
    fila_('Empleado', '<b>' + e(d.nombre) + '</b>') +
    fila_('Mail', e(d.email)) +
    fila_('Fecha del recorrido', e(fechaVisible_(d.fecha))) +
    fila_('Salidas', String(d.salidas.length)) +
    fila_('Salida y regreso', e(oficina)) +
    '</table>');

  partes.push('<div class="total"><div class="k">Total del día</div><b>' + e(formatoKm_(d.kmTotal)) + '</b></div>');

  // Salidas
  d.salidas.forEach(function (s) {
    var html = '<div class="salida"><h2>Salida ' + s.numero + (s.motivo ? ' <span>— ' + e(s.motivo) + '</span>' : '') + '</h2>';
    html += '<table class="tramos"><tr><th>#</th><th>Desde</th><th>Hasta</th><th class="km">Km</th></tr>';
    var puntos = [oficina].concat(s.paradas.map(etiquetaPuntoPdf_)).concat([oficina]);
    s.legs.forEach(function (l, i) {
      html += '<tr><td>' + (i + 1) + '</td><td>' + e(puntos[i]) + '</td><td>' + e(puntos[i + 1]) + '</td>' +
        '<td class="km">' + e(formatoKm_(l.km)) + '</td></tr>';
    });
    html += '<tr class="tot"><td></td><td></td><td>Total salida ' + s.numero + '</td>' +
      '<td class="km">' + e(formatoKm_(s.km)) + '</td></tr></table>';
    if (s.mapaBase64) {
      html += '<img class="mapa" src="data:' + (s.mapaTipo || 'image/png') + ';base64,' + s.mapaBase64 + '">';
    }
    html += '<div class="sub" style="margin-top:4px">Ver la ruta en Google Maps: <a href="' + e(s.linkMapa) + '">abrir mapa</a></div>';
    html += '</div>';
    partes.push(html);
  });

  partes.push('<div class="pie"><b>Proyecto Norte</b> · Office Park, San Lorenzo Chico, Salta<br>' +
    'Generado automáticamente el ' + e(d.generado) + ' por el sistema de Viáticos por km. ' +
    'Los kilómetros corresponden a la ruta en auto de Google Maps desde la oficina, pasando por las paradas en el orden ' +
    'cargado por el empleado, y de regreso a la oficina. No se aceptan PDF modificados a mano.</div>');

  partes.push('</body></html>');
  return partes.join('');
}

/** "Caseros 500, Salta" en vez de "Caseros 500 (Caseros 500, Salta)". */
function etiquetaPuntoPdf_(p) {
  if (!p.direccion || p.direccion === p.nombre) return p.nombre;
  if (p.direccion.indexOf(p.nombre) === 0) return p.direccion;
  return p.nombre + ' (' + p.direccion + ')';
}

function fila_(etiqueta, valorHtml) {
  return '<tr><td class="et">' + etiqueta + '</td><td>' + valorHtml + '</td></tr>';
}
