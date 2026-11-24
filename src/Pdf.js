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

/** Logo como data URI, o '' si no hay o no se puede leer. */
function logoDataUri_() {
  var id = obtenerConfig_().logoFileId;
  if (!id) return '';
  try {
    var blob = DriveApp.getFileById(id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    console.error('Logo: ' + e.message);
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

  partes.push(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:14mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#202124}' +
    'h1{font-size:16pt;margin:0 0 2px}' +
    'h2{font-size:12pt;margin:0 0 6px}' +
    '.sub{color:#5f6368;font-size:9.5pt}' +
    'table{border-collapse:collapse;width:100%}' +
    '.datos td{padding:3px 0;vertical-align:top}' +
    '.datos td.et{color:#5f6368;width:32%}' +
    '.tramos th,.tramos td{border-bottom:1px solid #dadce0;padding:5px 6px;text-align:left;vertical-align:top}' +
    '.tramos th{background:#f1f3f4;font-size:9.5pt}' +
    '.tramos td.km,.tramos th.km{text-align:right;white-space:nowrap}' +
    '.tramos tr.tot td{font-weight:bold;border-bottom:none}' +
    '.salida{margin-top:16px;page-break-inside:avoid}' +
    '.mapa{margin-top:8px;width:100%;max-width:640px;border:1px solid #dadce0}' +
    '.total{margin-top:14px;padding:10px 12px;border:2px solid #1a73e8;font-size:13pt}' +
    '.total b{font-size:15pt}' +
    '.pie{margin-top:18px;color:#5f6368;font-size:8.5pt;border-top:1px solid #dadce0;padding-top:6px}' +
    'a{color:#1a73e8}' +
    '</style></head><body>'
  );

  // Encabezado
  partes.push('<table><tr>' +
    (logoUri ? '<td style="width:120px;vertical-align:middle"><img src="' + logoUri + '" style="max-width:110px;max-height:60px"></td>' : '') +
    '<td style="vertical-align:middle"><h1>Detalle de recorridos en auto particular</h1>' +
    '<div class="sub">Viáticos por km · Proyecto Norte</div></td></tr></table>');

  partes.push('<table class="datos" style="margin-top:12px">' +
    fila_('Empleado', e(d.nombre)) +
    fila_('Mail', e(d.email)) +
    fila_('Fecha del recorrido', e(fechaVisible_(d.fecha))) +
    fila_('Salidas', String(d.salidas.length)) +
    fila_('Salida y regreso', e(oficina)) +
    '</table>');

  partes.push('<div class="total">Total del día: <b>' + e(formatoKm_(d.kmTotal)) + '</b></div>');

  // Salidas
  d.salidas.forEach(function (s) {
    var html = '<div class="salida"><h2>Salida ' + s.numero + (s.motivo ? ' — ' + e(s.motivo) : '') + '</h2>';
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

  partes.push('<div class="pie">Generado automáticamente el ' + e(d.generado) + ' por el sistema de Viáticos por km. ' +
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
