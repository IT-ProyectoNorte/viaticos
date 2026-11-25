/**
 * WebApp.js — entrada de la web app y funciones que llama la pantalla con google.script.run.
 * Toda función pública de acá valida al usuario con usuarioActual_().
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Viáticos por km — Proyecto Norte')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Datos para arrancar la pantalla. */
function iniciar() {
  var email = usuarioActual_();
  var c = obtenerConfig_();
  return {
    email: email,
    hoy: hoyClave_(),
    oficina: c.oficina.nombre,
    oficinaLat: c.oficina.lat,
    oficinaLng: c.oficina.lng,
    limitesSalta: c.limitesSalta,
    mapsApiKey: c.mapsApiKey,
    maxParadas: c.maxParadas,
    maxSalidas: c.maxSalidasPorDia,
    diasAtras: c.diasAtrasPermitidos,
    lugaresEmpresa: c.lugaresEmpresa,
    maxMisLugares: c.maxMisLugares
  };
}

/** Lugar a partir del clic en el mapa: confirma que sea de Salta y trae la dirección. */
function lugarEnPunto(lat, lng) {
  usuarioActual_();
  return lugarDesdeCoordenadas_({ lat: aNumero_(lat), lng: aNumero_(lng), nombre: '' })[0];
}

/** Busca lugares en Salta. */
function buscarLugares(texto) {
  usuarioActual_();
  return buscarLugares_(texto);
}

/** Calcula una salida para mostrar en pantalla (km, tramos, mapa). */
function calcularSalida(paradas) {
  usuarioActual_();
  var r = calcularRuta_(paradas, { conMapa: true });
  return {
    km: r.km,
    duracionMin: r.duracionMin,
    legs: r.legs,
    linkMapa: r.linkMapa,
    mapaBase64: r.mapaBase64,
    mapaTipo: r.mapaTipo
  };
}

/**
 * Recalcula todo el día en el servidor y devuelve el PDF en base64.
 * No se guarda nada: queda solo una línea en los registros de ejecución (Apps Script → Ejecuciones).
 */
function descargarPdf(dia) {
  var email = usuarioActual_();
  var preparado = prepararDia_(dia, email);
  var pdf = generarPdfDia_(preparado);
  console.log(JSON.stringify({
    evento: 'pdf', email: email, fecha: preparado.fecha,
    salidas: preparado.salidas.length, kmTotal: preparado.kmTotal
  }));
  return pdf;
}
