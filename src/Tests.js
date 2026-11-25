/**
 * Tests.js — se corren desde el editor (elegir la función y "Ejecutar") o con 'clasp run'.
 * Todos exigen la cuenta dueña: la web app corre como esa cuenta y no queremos que
 * un usuario del dominio pueda dispararlos con google.script.run.
 */

/**
 * Punto conocido para la prueba de ruta: Plaza 9 de Julio (centro de Salta).
 * TEST_KM_ESPERADO: completar con los km ida y vuelta que muestra Google Maps para
 * Oficina → Plaza → Oficina en auto (el link sale en el log de test_rutaBasica).
 * Mientras sea null, el test solo valida que el resultado sea coherente.
 */
var TEST_PUNTO_CONOCIDO = { nombre: 'Plaza 9 de Julio', direccion: 'Plaza 9 de Julio, Salta', lat: -24.789040, lng: -65.410380 };
var TEST_KM_ESPERADO = null;
var TEST_TOLERANCIA = 0.02; // ±2 %

/** Corre todos los tests y deja el resumen en el log. */
function correrTests() {
  exigirDueno_();
  var tests = [test_formatos, test_validarParadas, test_filtroSalta, test_leerUbicacion, test_htmlPdf,
    test_puntosDePaso, test_openStreetMap, test_rutaBasica, test_busqueda, test_pdfCompleto];
  var resultados = tests.map(function (t) {
    try {
      t();
      return '✔ ' + t.name;
    } catch (e) {
      return '✘ ' + t.name + ': ' + e.message;
    }
  });
  console.log('Tests\n' + resultados.join('\n'));
  return resultados;
}

// ---------------------------------------------------------------------------
// Lógica pura (no gastan cuota de Google Maps)
// ---------------------------------------------------------------------------

function test_formatos() {
  exigirDueno_();
  afirmarIgual_(redondear_(1.005, 2), 1.01, 'redondeo 1.005');
  afirmarIgual_(redondear_(12.35, 1), 12.4, 'redondeo km');
  afirmarIgual_(formatoKm_(1234.56), '1.234,6 km', 'formato km');
  afirmarIgual_(aNumero_('1.234,5'), 1234.5, 'número con miles y coma');
  afirmarIgual_(fechaVisible_('2026-11-20'), '20/11/2026', 'fecha visible');
  afirmarIgual_(fechaClave_('2026-13-01'), '', 'mes inválido');
  afirmarIgual_(fechaClave_('2026-02-31'), '', 'día inexistente');
  afirmarIgual_(diasEntre_('2026-10-31', '2026-11-24'), 24, 'días entre fechas');
  afirmarIgual_(escaparHtml_('<b>"A&B"</b>'), '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;', 'escape HTML');
  console.log('test_formatos OK');
}

function test_validarParadas() {
  exigirDueno_();
  afirmarError_(function () { validarParadas_([], 10); }, 'al menos una', 'sin paradas');
  afirmarError_(function () {
    validarParadas_(Array(11).fill({ lat: -24.8, lng: -65.4 }), 10);
  }, 'Como máximo', 'demasiadas paradas');
  afirmarError_(function () { validarParadas_([{ lat: 'abc', lng: 1 }], 10); }, 'ubicación válida', 'lat inválida');
  afirmarError_(function () { validarParadas_([{ lat: -34.6037, lng: -58.3816 }], 10); }, 'fuera de la provincia', 'Buenos Aires');
  afirmarError_(function () { validarParadas_([{ lat: 0, lng: 0 }], 10); }, 'fuera de la provincia', '0,0');

  var ok = validarParadas_([{ direccion: ' Calle   Falsa 123 ', lat: '-24,7891234567', lng: -65.41 }], 10);
  afirmarIgual_(ok[0].lat, -24.789123, 'lat redondeada a 6 decimales');
  afirmarIgual_(ok[0].nombre, 'Calle Falsa 123', 'nombre toma la dirección si falta');
  console.log('test_validarParadas OK');
}

function test_filtroSalta() {
  exigirDueno_();
  function res(id, provincia, lat, lng, tipos, dir) {
    return {
      place_id: id, types: tipos || ['street_address'], formatted_address: dir || ('Calle ' + id + ', Salta, Argentina'),
      address_components: [{ long_name: provincia, types: ['administrative_area_level_1', 'political'] }],
      geometry: { location: { lat: lat, lng: lng }, location_type: 'ROOFTOP' }
    };
  }
  var filtrados = filtrarResultadosSalta_([
    res('a', 'Salta', -24.79, -65.41, null, 'Caseros 500, A4400 Salta, Argentina'),
    res('b', 'Jujuy', -24.18, -65.30),                               // otra provincia
    res('c', 'Salta', -24.8, -65.4, ['administrative_area_level_1']), // la provincia entera
    res('a', 'Salta', -24.79, -65.41),                               // repetido
    res('d', 'Provincia de Salta', -22.5, -63.8),                    // Tartagal, nombre largo
    res('e', 'Salta', -34.6, -58.4)                                  // dice Salta pero cae afuera
  ], 'Salta');
  afirmarIgual_(filtrados.map(function (f) { return f.place_id; }).join(','), 'a,d', 'filtrado por provincia');
  afirmarIgual_(filtrados[0].nombre, 'Caseros 500', 'nombre = primera parte de la dirección');
  afirmarIgual_(filtrados[0].direccion, 'Caseros 500, A4400 Salta', 'sin ", Argentina"');
  console.log('test_filtroSalta OK');
}

function test_leerUbicacion() {
  exigirDueno_();
  var u;
  u = leerUbicacionDeTexto_('-24.7979909, -65.4723851');
  afirmarIgual_(u.lat + ',' + u.lng, '-24.7979909,-65.4723851', 'coordenadas sueltas');

  u = leerUbicacionDeTexto_('https://www.google.com/maps/place/Office+Park+-+San+Lorenzo+Chico/@-24.7978,-65.4747,17z/' +
    'data=!3m1!4b1!4m6!3m5!1s0x941bc34a9d84a275:0x54ffb299636ceb42!8m2!3d-24.7979909!4d-65.4723851!16s');
  afirmarIgual_(u.lat + ',' + u.lng, '-24.7979909,-65.4723851', 'link de lugar: usa el pin, no el centro del mapa');
  afirmarIgual_(u.nombre, 'Office Park - San Lorenzo Chico', 'nombre del lugar desde el link');

  u = leerUbicacionDeTexto_('https://maps.google.com/?q=-24.789,-65.410');
  afirmarIgual_(u.lat + ',' + u.lng, '-24.789,-65.41', 'parámetro q con coordenadas');

  u = leerUbicacionDeTexto_('https://www.google.com/maps/search/?api=1&query=Caseros+500+Salta');
  afirmarIgual_(u.texto, 'Caseros 500 Salta', 'parámetro query con texto');

  u = leerUbicacionDeTexto_('https://www.google.com/maps/place/Hospital+San+Bernardo/@-24.78,-65.40,15z');
  afirmarIgual_(u.texto, 'Hospital San Bernardo', 'lugar sin pin: busca por nombre');

  u = leerUbicacionDeTexto_('https://www.google.com.ar/maps/@-24.79,-65.41,14z');
  afirmarIgual_(u.lat + ',' + u.lng, '-24.79,-65.41', 'solo centro del mapa');

  afirmarError_(function () {
    leerUbicacionDeTexto_('https://www.google.com/maps/dir/-24.7978195,-65.4729419/Office+Park/@-24.79,-65.47,17z/' +
      'data=!4m19!1m11!3m4!1m2!1d-65.47!2d-24.79!3s0x1!1m5!1m1!1s0x2!2m2!1d-65.4723851!2d-24.7979909!3e2');
  }, 'varios puntos', 'link de recorrido');

  afirmarIgual_(leerUbicacionDeTexto_('Caseros 500'), null, 'texto común');
  afirmarIgual_(leerUbicacionDeTexto_('https://www.ejemplo.com/maps/@-24.79,-65.41'), null, 'otro dominio no es link de Maps');
  afirmar_(esLinkCortoMaps_('https://maps.app.goo.gl/AbC123'), 'link corto');
  afirmar_(!esLinkCortoMaps_('https://bit.ly/xyz'), 'otro acortador no');
  console.log('test_leerUbicacion OK');
}

function test_htmlPdf() {
  exigirDueno_();
  var html = htmlPdf_({
    fecha: '2026-11-24', nombre: 'Ana <script>', email: 'ana@' + CONFIG.dominio, kmTotal: 23.4,
    generado: '24/11/2026 18:00',
    salidas: [{
      numero: 1, motivo: 'Obra Cerrillos', km: 23.4, duracionMin: 35, linkMapa: 'https://www.google.com/maps/dir/?api=1&x=1',
      mapaBase64: 'AAAA',
      paradas: [{ nombre: 'Obra', direccion: 'Ruta 68 km 5, Cerrillos' }],
      legs: [{ km: 11.7 }, { km: 11.7 }]
    }]
  }, '');
  afirmar_(html.indexOf('Ana &lt;script&gt;') >= 0, 'el nombre tiene que ir escapado');
  afirmar_(html.indexOf('<script>') < 0, 'no puede haber <script> en el PDF');
  afirmar_(html.indexOf('23,4 km') >= 0, 'falta el total del día');
  afirmar_(html.indexOf('24/11/2026') >= 0, 'falta la fecha');
  afirmar_(html.indexOf('data:image/png;base64,AAAA') >= 0, 'falta el mapa');
  afirmar_(html.indexOf('&amp;x=1') >= 0, 'el link tiene que ir escapado');
  console.log('test_htmlPdf OK');
}

function test_puntosDePaso() {
  exigirDueno_();
  var oficina = { lat: CONFIG.oficina.lat, lng: CONFIG.oficina.lng };
  var reglas = CONFIG.puntosDePaso;
  var arbolada = { lat: -24.8307205, lng: -65.5112799 };
  var plaza = TEST_PUNTO_CONOCIDO;
  var sanLuis = { lat: -24.865, lng: -65.505 }; // al sur del punto de paso

  var p = armarPuntosRuta_(oficina, [arbolada], reglas);
  afirmarIgual_(p.length, 2, 'Arbolada: parada + paso a la vuelta');
  afirmar_(!p[0].esPaso && p[1].esPaso, 'el paso va después de La Arbolada');

  p = armarPuntosRuta_(oficina, [plaza], reglas);
  afirmarIgual_(p.length, 1, 'sin La Arbolada no hay punto de paso');

  p = armarPuntosRuta_(oficina, [arbolada, plaza], reglas);
  afirmarIgual_(p.length, 3, 'Arbolada → Plaza: paso entre las dos');
  afirmar_(p[1].esPaso && !p[2].esPaso, 'orden Arbolada, paso, Plaza');

  p = armarPuntosRuta_(oficina, [arbolada, sanLuis], reglas);
  afirmarIgual_(p.length, 2, 'hacia el sur no se fuerza la colectora');

  var unidos = unirTramosDePaso_([
    { desde: 'O', hasta: 'A', metros: 6400, segundos: 600 },
    { desde: 'A', hasta: 'P', metros: 3700, segundos: 400 },
    { desde: 'P', hasta: 'O', metros: 2700, segundos: 300 }
  ], [{ esPaso: false }, { esPaso: true }]);
  afirmarIgual_(unidos.length, 2, 'un tramo por parada');
  afirmarIgual_(unidos[1].metros, 6400, 'el tramo de vuelta suma el paso');
  afirmarIgual_(unidos[1].hasta, 'O', 'el tramo de vuelta termina en la oficina');
  console.log('test_puntosDePaso OK');
}

function test_openStreetMap() {
  exigirDueno_();
  // Polyline: ejemplo de la documentación de Google.
  var pts = decodificarPolyline_('_p~iF~ps|U_ulLnnqC');
  afirmarIgual_(pts.length, 2, 'polyline: 2 puntos');
  afirmarIgual_(pts[0][0], 38.5, 'polyline: lat del primer punto');
  afirmarIgual_(pts[1][1], -120.95, 'polyline: lng del último punto');
  afirmarIgual_(codificarPolyline_(pts), '_p~iF~ps|U_ulLnnqC', 'polyline: ida y vuelta');

  var larga = [];
  for (var i = 0; i < 3000; i++) larga.push([-24.79 - i * 0.00005, -65.47 + i * 0.00005]);
  var corta = acortarPolyline_(codificarPolyline_(larga), 6000);
  afirmar_(corta.length > 0 && corta.length <= 6000, 'polyline larga acortada');
  var extremos = decodificarPolyline_(corta);
  afirmarIgual_(extremos[0][0], larga[0][0], 'conserva el primer punto');

  var ok = leerRespuestaOrs_(200, JSON.stringify({ routes: [{
    geometry: 'abc', segments: [{ distance: 6400, duration: 600 }, { distance: 6450, duration: 620 }]
  }] }), 1);
  afirmarIgual_(ok.km, 12.9, 'ORS: km totales');
  afirmarIgual_(ok.legs.length, 2, 'ORS: un tramo por parada + vuelta');
  afirmarIgual_(ok.legs[1].km, 6.5, 'ORS: km del tramo');
  afirmarError_(function () { leerRespuestaOrs_(429, '{}', 1); }, 'límite', 'ORS: cuota');
  afirmarError_(function () { leerRespuestaOrs_(403, '{}', 1); }, 'clave', 'ORS: key rechazada');
  afirmarError_(function () {
    leerRespuestaOrs_(404, JSON.stringify({ error: { code: 2010, message: 'Could not find routable point within a radius of 1000.0 meters' } }), 1);
  }, 'calle transitable', 'ORS: parada lejos de la calle');
  console.log('test_openStreetMap OK');
}

// ---------------------------------------------------------------------------
// Con Google Maps (gastan cuota; después quedan en cache 6 h)
// ---------------------------------------------------------------------------

/** Ruta real: Oficina → Plaza 9 de Julio → Oficina. */
function test_rutaBasica() {
  exigirDueno_();
  var ruta = calcularRuta_([TEST_PUNTO_CONOCIDO]);

  afirmar_(ruta.legs.length === 2, 'tiene que haber 2 tramos (ida y vuelta), hay ' + ruta.legs.length);
  afirmar_(ruta.km > 1 && ruta.km < 100, 'km fuera de rango razonable: ' + ruta.km);
  var sumaTramos = redondear_(ruta.legs[0].km + ruta.legs[1].km, 1);
  afirmar_(Math.abs(sumaTramos - ruta.km) <= 0.2, 'la suma de tramos (' + sumaTramos + ') no coincide con el total (' + ruta.km + ')');
  afirmar_(ruta.polyline.length > 0, 'falta la polyline');
  afirmar_(ruta.linkMapa.indexOf('https://www.google.com/maps/dir/?api=1') === 0, 'link de mapa mal armado');
  afirmar_(ruta.mapaBase64 && ruta.mapaBase64.length > 1000, 'no se generó el mapa estático (ver el log de StaticMap)');

  var otra = calcularRuta_([TEST_PUNTO_CONOCIDO], { conMapa: false });
  afirmar_(otra.desdeCache, 'la segunda consulta no salió del cache');
  afirmarIgual_(otra.km, ruta.km, 'km desde cache');

  if (TEST_KM_ESPERADO !== null) {
    var desvio = Math.abs(ruta.km - TEST_KM_ESPERADO) / TEST_KM_ESPERADO;
    afirmar_(desvio <= TEST_TOLERANCIA,
      'km calculados ' + ruta.km + ' vs Google Maps ' + TEST_KM_ESPERADO + ' (desvío ' + (desvio * 100).toFixed(1) + '%)');
  }

  console.log('test_rutaBasica OK: ' + formatoKm_(ruta.km) + ', ' + ruta.duracionMin + ' min' +
    (TEST_KM_ESPERADO === null ? ' (completar TEST_KM_ESPERADO para comparar)' : '') +
    '\nIda: ' + ruta.legs[0].km + ' km · Vuelta: ' + ruta.legs[1].km + ' km' +
    '\nComparar en Google Maps: ' + ruta.linkMapa);
}

/** El buscador encuentra un lugar de Salta y no devuelve lugares de otra provincia. */
function test_busqueda() {
  exigirDueno_();
  var r = buscarLugares_('Caseros 500');
  afirmar_(r.length > 0, 'no encontró "Caseros 500" en Salta');
  r.forEach(function (x) { afirmar_(dentroDeSalta_(x.lat, x.lng), 'resultado fuera de Salta: ' + x.direccion); });
  var jujuy = buscarLugares_('Plaza Belgrano, San Salvador de Jujuy');
  jujuy.forEach(function (x) { afirmar_(/salta/i.test(x.direccion), 'devolvió algo que no es de Salta: ' + x.direccion); });
  console.log('test_busqueda OK: ' + r.map(function (x) { return x.direccion; }).join(' | '));
}

/**
 * Genera un PDF real de 2 salidas y controla tamaño y total.
 * Para verlo, usar la web app (no se guarda en Drive: el script solo tiene permiso de lectura).
 */
function test_pdfCompleto() {
  exigirDueno_();
  var dia = prepararDia_({
    fecha: hoyClave_(), nombre: 'Prueba Sistema',
    salidas: [
      { motivo: 'Prueba centro', paradas: [TEST_PUNTO_CONOCIDO] },
      { motivo: 'Prueba dos paradas', paradas: [
        { nombre: 'Aeropuerto', lat: -24.8560, lng: -65.4862 },
        TEST_PUNTO_CONOCIDO
      ] }
    ]
  }, Session.getEffectiveUser().getEmail());
  var pdf = generarPdfDia_(dia);
  afirmar_(pdf.base64.length > 20000, 'el PDF es sospechosamente chico (' + pdf.base64.length + ' bytes en base64)');
  afirmarIgual_(pdf.kmTotal, redondear_(dia.salidas[0].km + dia.salidas[1].km, 1), 'total del día');
  console.log('test_pdfCompleto OK: ' + pdf.nombreArchivo + ', ' + formatoKm_(pdf.kmTotal) +
    ', ' + Math.round(pdf.base64.length * 3 / 4 / 1024) + ' KB');
}

// ---------------------------------------------------------------------------
// Aserciones
// ---------------------------------------------------------------------------

function afirmar_(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

function afirmarIgual_(actual, esperado, mensaje) {
  if (actual !== esperado) {
    throw new Error(mensaje + ': se esperaba ' + JSON.stringify(esperado) + ' y dio ' + JSON.stringify(actual));
  }
}

function afirmarError_(fn, fragmento, mensaje) {
  try {
    fn();
  } catch (e) {
    if (String(e.message).indexOf(fragmento) >= 0) return;
    throw new Error(mensaje + ': error inesperado "' + e.message + '"');
  }
  throw new Error(mensaje + ': se esperaba un error y no lo hubo');
}
