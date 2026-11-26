/**
 * Config.js — configuración fija del sistema.
 * No hay planilla: lo que cambia poco vive acá y se actualiza pegando el archivo en el editor de Apps Script.
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
  maxResultadosBusqueda: 6,

  // Lugares frecuentes de la empresa: aparecen como botones "Lugares más concurridos" en cada salida, para todos.
  // Cada uno: { nombre: 'Obra La Arbolada', direccion: 'Finca El Ceibal, San Lorenzo', lat: -24.83, lng: -65.51 }
  // Tienen que estar en la provincia de Salta (validarConfig() lo revisa). El orden de acá es el de la pantalla.
  lugaresEmpresa: [
    { nombre: 'Las Achiras', direccion: '', lat: -24.838277, lng: -65.468244 },
    { nombre: 'San Luis Chico', direccion: '', lat: -24.844372, lng: -65.504609 },
    { nombre: 'Las Chuñas', direccion: '', lat: -24.796712, lng: -65.484869 },
    { nombre: 'Tribeca', direccion: '', lat: -24.795133, lng: -65.483029 },
    { nombre: 'Hilton', direccion: '', lat: -24.795693, lng: -65.484193 },
    { nombre: 'Chacras de Manantial', direccion: '', lat: -24.838393, lng: -65.607519 },
    { nombre: 'Chacra de Santa María', direccion: '', lat: -24.785731, lng: -65.502501 },
    { nombre: 'La Aguada', direccion: '', lat: -24.786507, lng: -65.501845 },
    { nombre: 'El Retiro', direccion: '', lat: -24.713802, lng: -65.480717 }
  ],
  maxMisLugares: 30, // lugares que cada empleado puede guardar con nombre en su navegador

  // Puntos de paso definidos por la empresa: corrigen desvíos innecesarios que Google Maps toma por defecto.
  // Solo se usan cuando los km salen de Google Maps (sin ORS_API_KEY): OpenStreetMap ya calcula la ruta por las avenidas.
  // Si un tramo sale de una parada dentro de la zona y va hacia un punto fuera de la zona que está más al
  // norte que el punto de paso (por ejemplo, la vuelta a la oficina), la ruta pasa obligatoriamente por
  // el punto de paso. No suma una parada: sus km quedan dentro del mismo tramo.
  puntosDePaso: [
    {
      // Desde La Arbolada, Google baja hasta la rotonda de San Luis para volver. Se vuelve por la colectora.
      nombre: 'Colectora (La Arbolada)',
      zona: { lat: -24.8307205, lng: -65.5112799, radioKm: 1.5 },
      paso: { lat: -24.8142, lng: -65.4825 } // colectora oeste de la Au. Circunvalación, a la altura de Golohouse
    }
  ]
};

/**
 * Configuración completa: CONFIG + Propiedades del script.
 * LOGO_FILE_ID (opcional): ID de un PNG/JPG en el Drive de la cuenta dueña para el encabezado del PDF.
 * MAPS_API_KEY (opcional): key de Maps JavaScript API para "Elegir en el mapa". Es una key de navegador:
 *   el navegador la ve sí o sí, así que tiene que estar restringida por referrer y por API (ver SETUP.md).
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
    puntosDePaso: CONFIG.puntosDePaso,
    lugaresEmpresa: lugaresEmpresaValidos_(CONFIG.lugaresEmpresa),
    maxMisLugares: CONFIG.maxMisLugares,
    // Con ORS_API_KEY los km salen de OpenStreetMap (OpenRouteService, ruta más rápida, igual que openstreetmap.org); sin key, de Google Maps.
    orsApiKey: (props.getProperty('ORS_API_KEY') || '').trim(),
    logoFileId: (props.getProperty('LOGO_FILE_ID') || '').trim(),
    mapsApiKey: (props.getProperty('MAPS_API_KEY') || '').trim()
  };
}

/**
 * Lógica pura (testeable): deja solo los lugares de la empresa bien cargados (nombre y coordenadas en Salta),
 * con el mismo formato que una parada.
 */
function lugaresEmpresaValidos_(lista) {
  return (Array.isArray(lista) ? lista : []).filter(function (l) {
    return l && textoLimpio_(l.nombre, 60) && isFinite(Number(l.lat)) && isFinite(Number(l.lng)) &&
      dentroDeSalta_(Number(l.lat), Number(l.lng));
  }).map(function (l) {
    return {
      nombre: textoLimpio_(l.nombre, 60),
      direccion: textoLimpio_(l.direccion, 250),
      place_id: '',
      lat: redondear_(Number(l.lat), 6),
      lng: redondear_(Number(l.lng), 6)
    };
  });
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

  chequear(true, c.mapsApiKey
    ? 'Mapa para elegir paradas: key cargada (si el mapa no carga, revisar las restricciones de la key)'
    : 'Mapa para elegir paradas: sin MAPS_API_KEY, el botón "Elegir en el mapa" no se muestra (opcional)');

  var descartados = (CONFIG.lugaresEmpresa || []).length - c.lugaresEmpresa.length;
  chequear(descartados === 0, 'Lugares de la empresa: ' + c.lugaresEmpresa.length + ' cargados' +
    (descartados ? ' (' + descartados + ' con nombre vacío o fuera de Salta, no se muestran)' : ''));

  if (c.orsApiKey) {
    try {
      var prueba = consultarOrs_(c.oficina, [{ lat: -24.78904, lng: -65.41038 }], c.orsApiKey);
      chequear(true, 'Km desde OpenStreetMap (OpenRouteService): OK, oficina → Plaza 9 de Julio → oficina = ' + prueba.km + ' km');
    } catch (e) {
      chequear(false, 'Km desde OpenStreetMap: ' + e.message);
    }
  } else {
    chequear(true, 'Km desde Google Maps (sin ORS_API_KEY)');
  }

  console.log('Validar configuración\n' + lineas.join('\n'));
  return lineas;
}
