/**
 * Config.js — configuración fija del sistema.
 * No hay planilla: lo que cambia poco vive acá y se modifica con un `clasp push`.
 * Lo opcional o sensible va en Propiedades del script (Configuración del proyecto → Propiedades del script).
 */

var CONFIG = {
  oficina: {
    nombre: 'Oficina — Office Park, San Lorenzo Chico',
    direccion: 'Office Park, San Lorenzo Chico, Salta',
    lat: -24.7979909,
    lng: -65.4723851
  },
  dominio: 'proyectonorte.com.ar',

  // Las paradas tienen que estar en la provincia de Salta.
  provincia: 'Salta',
  // Rectángulo que contiene a la provincia (con un margen chico). Se usa como control rápido de
  // coordenadas; el buscador además exige que Google diga que el lugar es de la provincia de Salta.
  limitesSalta: { surLat: -26.45, norteLat: -21.95, oesteLng: -68.65, esteLng: -62.25 },

  optimizarOrden: false,  // se respeta el orden en que el empleado carga las paradas
  maxParadas: 10,         // por salida
  maxSalidasPorDia: 8,
  diasAtrasPermitidos: 31, // hasta cuántos días hacia atrás se puede armar un PDF
  maxResultadosBusqueda: 6
};

/**
 * Configuración completa: CONFIG + Propiedades del script.
 * LOGO_FILE_ID (opcional): ID de un PNG/JPG en el Drive de la cuenta dueña para el encabezado del PDF.
 */
function obtenerConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    oficina: CONFIG.oficina,
    dominio: CONFIG.dominio,
    provincia: CONFIG.provincia,
    limitesSalta: CONFIG.limitesSalta,
    optimizarOrden: CONFIG.optimizarOrden,
    maxParadas: CONFIG.maxParadas,
    maxSalidasPorDia: CONFIG.maxSalidasPorDia,
    diasAtrasPermitidos: CONFIG.diasAtrasPermitidos,
    maxResultadosBusqueda: CONFIG.maxResultadosBusqueda,
    logoFileId: (props.getProperty('LOGO_FILE_ID') || '').trim()
  };
}

/** ¿Las coordenadas caen dentro del rectángulo de Salta? */
function dentroDeSalta_(lat, lng) {
  var l = CONFIG.limitesSalta;
  return lat >= l.surLat && lat <= l.norteLat && lng >= l.oesteLng && lng <= l.esteLng;
}

/**
 * Revisa la configuración y la muestra en el log. Correr desde el editor después de cada cambio.
 */
function validarConfig() {
  exigirDueno_();
  var c = obtenerConfig_();
  var lineas = [];
  function chequear(ok, msg) { lineas.push((ok ? '✔ ' : '✘ ') + msg); }

  chequear(dentroDeSalta_(c.oficina.lat, c.oficina.lng), 'La oficina está dentro de Salta');
  try {
    var geo = Maps.newGeocoder().setLanguage('es').setRegion('ar').reverseGeocode(c.oficina.lat, c.oficina.lng);
    chequear(geo.status === 'OK', 'Oficina en el mapa: ' +
      (geo.status === 'OK' && geo.results.length ? geo.results[0].formatted_address : geo.status));
  } catch (e) {
    chequear(false, 'No se pudo consultar Google Maps: ' + e.message);
  }

  var dueno = Session.getEffectiveUser().getEmail();
  chequear(dueno.toLowerCase().split('@')[1] === c.dominio,
    'Cuenta dueña ' + dueno + ' es del dominio ' + c.dominio);

  if (c.logoFileId) {
    try {
      var f = DriveApp.getFileById(c.logoFileId);
      chequear(/^image\/(png|jpeg)$/.test(f.getMimeType()), 'Logo: ' + f.getName() + ' (' + f.getMimeType() + ')');
    } catch (e) {
      chequear(false, 'No se puede abrir el logo LOGO_FILE_ID=' + c.logoFileId);
    }
  } else {
    chequear(true, 'Logo: sin cargar (opcional)');
  }

  console.log('Validar configuración\n' + lineas.join('\n'));
  return lineas;
}
