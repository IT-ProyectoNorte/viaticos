/**
 * Rutas.js — búsqueda de lugares en Salta y cálculo de la ruta Oficina → paradas → Oficina.
 */

var CACHE_SEGUNDOS = 6 * 60 * 60; // 6 h
var MAPA_ANCHO = 640;             // máximo de Static Maps sin plan premium
var MAPA_ALTO = 400;
var MAX_LARGO_POLYLINE = 6000;    // la URL de Static Maps admite ~8192 caracteres

// ---------------------------------------------------------------------------
// Búsqueda de lugares (Geocoder de Apps Script, sin costo)
// ---------------------------------------------------------------------------

/**
 * Busca una dirección o lugar y devuelve solo resultados de la provincia de Salta.
 * También acepta un link de Google Maps (largo o corto) o coordenadas "lat, lng".
 * @return {{nombre, direccion, place_id, lat, lng, aproximado}[]}
 */
function buscarLugares_(texto) {
  var crudo = String(texto === null || texto === undefined ? '' : texto).trim().slice(0, 2000);

  // Link corto de "Compartir" (maps.app.goo.gl/...): se resuelve al link largo.
  var eraLinkCorto = esLinkCortoMaps_(crudo);
  if (eraLinkCorto) crudo = resolverLinkCorto_(crudo);

  var ubicacion = leerUbicacionDeTexto_(crudo);
  if (eraLinkCorto && !ubicacion) {
    throw new Error('No pudimos abrir ese link de Google Maps. Revisá que esté completo o copialo de nuevo.');
  }
  if (ubicacion && ubicacion.lat !== undefined) return lugarDesdeCoordenadas_(ubicacion);
  if (ubicacion && ubicacion.texto) crudo = ubicacion.texto; // link sin coordenadas: buscar por nombre

  return buscarPorTexto_(crudo);
}

/**
 * Lógica pura (testeable): saca coordenadas o un texto buscable de lo que pegó el usuario.
 * Devuelve {lat, lng, nombre} | {texto} | null (si es texto común para buscar).
 */
function leerUbicacionDeTexto_(texto) {
  var s = String(texto || '').trim();
  var num = '(-?\\d{1,3}(?:\\.\\d+)?)';

  // Coordenadas sueltas: "-24.7979, -65.4723"
  var m = s.match(new RegExp('^' + num + '\\s*[,;\\s]\\s*' + num + '$'));
  if (m) return { lat: Number(m[1]), lng: Number(m[2]), nombre: '' };

  if (!/^https?:\/\/([a-z0-9-]+\.)*google\.[a-z.]+\/maps|^https?:\/\/maps\.google\./i.test(s)) return null;

  var url = s;
  try { url = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { /* se usa como vino */ }

  var nombre = '';
  var mp = url.match(/\/maps\/place\/([^\/@?]+)/);
  if (mp) nombre = mp[1].trim();

  // 1) Pin del lugar (!3d lat !4d lng): es la ubicación exacta del lugar elegido.
  var pines = [];
  var re = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g;
  var p;
  while ((p = re.exec(url)) !== null) pines.push(p);
  if (pines.length && !/\/maps\/dir\//.test(url)) {
    var ultimo = pines[pines.length - 1];
    return { lat: Number(ultimo[1]), lng: Number(ultimo[2]), nombre: nombre };
  }

  // 2) Parámetros con coordenadas (?q=lat,lng, ?query=, ?ll=, ?destination=).
  var mq = url.match(new RegExp('[?&](?:q|query|ll|destination|center)=' + num + ',\\s*' + num));
  if (mq) return { lat: Number(mq[1]), lng: Number(mq[2]), nombre: nombre };

  // 3) Link de un lugar con nombre: se busca por el nombre (más preciso que el centro del mapa).
  if (nombre && !/^-?\d/.test(nombre)) return { texto: nombre };

  // 4) Parámetro de búsqueda con texto (?q=Caseros 500 Salta).
  var mt = url.match(/[?&](?:q|query)=([^&]+)/);
  if (mt) return { texto: mt[1].trim() };

  // 5) Centro del mapa (@lat,lng,zoom): último recurso.
  var mc = url.match(new RegExp('@' + num + ',' + num));
  if (mc && !/\/maps\/dir\//.test(url)) return { lat: Number(mc[1]), lng: Number(mc[2]), nombre: nombre };

  if (/\/maps\/dir\//.test(url)) {
    throw new Error('Ese link es de un recorrido con varios puntos. Pegá el link de un solo lugar.');
  }
  throw new Error('No pudimos leer una ubicación en ese link de Google Maps. Probá con "Compartir → Copiar vínculo" sobre el lugar.');
}

function esLinkCortoMaps_(s) {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(s);
}

/**
 * Sigue las redirecciones de un link corto de Google Maps (solo dominios de Google) y devuelve el link largo.
 */
function resolverLinkCorto_(url) {
  var permitido = /^https?:\/\/((maps\.app\.)?goo\.gl|([a-z0-9-]+\.)*google\.[a-z.]+)\//i;
  var actual = url;
  for (var i = 0; i < 5; i++) {
    if (!permitido.test(actual)) throw new Error('Ese link no es de Google Maps.');
    var resp;
    try {
      resp = UrlFetchApp.fetch(actual, { followRedirects: false, muteHttpExceptions: true });
    } catch (e) {
      throw new Error('No se pudo abrir el link de Google Maps. Probá de nuevo.');
    }
    var codigo = resp.getResponseCode();
    if (codigo < 300 || codigo >= 400) return actual;
    var h = resp.getAllHeaders();
    var destino = h.Location || h.location;
    if (Array.isArray(destino)) destino = destino[0];
    if (!destino) return actual;
    actual = destino;
    if (!esLinkCortoMaps_(actual) && /google\.[a-z.]+\/maps/i.test(actual)) return actual;
  }
  return actual;
}

/** Arma el lugar a partir de coordenadas: verifica que sea Salta y busca la dirección. */
function lugarDesdeCoordenadas_(u) {
  var c = obtenerConfig_();
  if (!isFinite(u.lat) || !isFinite(u.lng) || !dentroDeSalta_(u.lat, u.lng)) {
    throw new Error('Ese punto está fuera de la provincia de Salta.');
  }
  var direccion = '';
  var placeId = '';
  var r = null;
  try {
    r = Maps.newGeocoder().setLanguage('es').setRegion('ar').reverseGeocode(u.lat, u.lng);
  } catch (e) {
    console.error('reverseGeocode: ' + e.message);
  }
  if (r && r.status === 'OK' && r.results && r.results.length) {
    var lugares = filtrarResultadosSalta_(r.results, c.provincia);
    // Google conoce el punto y no es de Salta (p. ej. Jujuy, que entra en el rectángulo).
    if (!lugares.length) throw new Error('Ese punto está fuera de la provincia de Salta.');
    direccion = lugares[0].direccion;
    placeId = lugares[0].place_id;
  } else {
    // Sin respuesta de Google: alcanza con el rectángulo de Salta y se muestran las coordenadas.
    direccion = redondear_(u.lat, 6) + ', ' + redondear_(u.lng, 6);
  }
  return [{
    nombre: textoLimpio_(u.nombre, 150) || direccion.split(',')[0],
    direccion: direccion,
    place_id: placeId,
    lat: redondear_(u.lat, 6),
    lng: redondear_(u.lng, 6),
    aproximado: false
  }];
}

/** Búsqueda por texto con el Geocoder, limitada a Salta. */
function buscarPorTexto_(texto) {
  var c = obtenerConfig_();
  var consulta = textoLimpio_(texto, 150);
  if (consulta.length < 3) throw new Error('Escribí al menos 3 letras para buscar.');
  // Empujar la búsqueda a Salta si el usuario no lo escribió.
  if (!/salta/i.test(consulta)) consulta += ', Salta, Argentina';

  var cache = CacheService.getScriptCache();
  var clave = 'busq:' + hash_(consulta.toLowerCase());
  var guardado = cache.get(clave);
  if (guardado) return JSON.parse(guardado);

  var l = c.limitesSalta;
  var resp;
  try {
    resp = Maps.newGeocoder()
      .setBounds(l.surLat, l.oesteLng, l.norteLat, l.esteLng)
      .setRegion('ar')
      .setLanguage('es')
      .geocode(consulta);
  } catch (e) {
    console.error('Geocoder: ' + e.message);
    throw new Error('No se pudo buscar en Google Maps en este momento. Probá de nuevo más tarde.');
  }

  var lugares = filtrarResultadosSalta_((resp && resp.status === 'OK') ? resp.results : [], c.provincia)
    .slice(0, c.maxResultadosBusqueda);
  try { cache.put(clave, JSON.stringify(lugares), CACHE_SEGUNDOS); } catch (e) { /* no crítico */ }
  return lugares;
}

/**
 * Lógica pura (testeable): de los resultados del Geocoder, deja solo los de la provincia indicada
 * y descarta los demasiado genéricos (la provincia o el país enteros).
 */
function filtrarResultadosSalta_(resultados, provincia) {
  var vistos = {};
  return (resultados || []).filter(function (r) {
    var tipos = r.types || [];
    if (tipos.indexOf('country') >= 0 || tipos.indexOf('administrative_area_level_1') >= 0) return false;
    var prov = (r.address_components || []).filter(function (ac) {
      return (ac.types || []).indexOf('administrative_area_level_1') >= 0;
    })[0];
    if (!prov || !new RegExp('^(provincia de )?' + provincia + '$', 'i').test(prov.long_name)) return false;
    var loc = r.geometry && r.geometry.location;
    if (!loc || !dentroDeSalta_(loc.lat, loc.lng)) return false;
    if (vistos[r.place_id]) return false;
    vistos[r.place_id] = true;
    return true;
  }).map(function (r) {
    var direccion = String(r.formatted_address || '').replace(/,?\s*Argentina$/, '');
    return {
      nombre: direccion.split(',')[0],
      direccion: direccion,
      place_id: r.place_id || '',
      lat: redondear_(r.geometry.location.lat, 6),
      lng: redondear_(r.geometry.location.lng, 6),
      aproximado: !!r.partial_match || (r.geometry.location_type === 'APPROXIMATE')
    };
  });
}

// ---------------------------------------------------------------------------
// Cálculo de ruta
// ---------------------------------------------------------------------------

/**
 * Calcula la ruta en auto que sale de la oficina, pasa por las paradas (en el orden cargado)
 * y vuelve a la oficina. Nunca confía en km del cliente: todo sale de la respuesta de Google.
 *
 * @param {Object[]} paradas [{nombre, direccion, place_id, lat, lng}]
 * @param {{conMapa: boolean}=} opciones conMapa (default true) agrega mapaBase64 (PNG).
 * @return {{km, duracionMin, paradas, legs: {desde, hasta, km, duracionMin}[], polyline, linkMapa, mapaBase64, desdeCache}}
 */
function calcularRuta_(paradas, opciones) {
  opciones = opciones || {};
  var conMapa = opciones.conMapa !== false;
  var c = obtenerConfig_();
  var limpias = validarParadas_(paradas, c.maxParadas);
  var oficina = { lat: c.oficina.lat, lng: c.oficina.lng };
  var motor = c.orsApiKey ? 'osm' : 'google';
  // Los puntos de paso corrigen desvíos de Google. Con OpenStreetMap (ruta más corta) no hacen falta.
  // Con orden optimizado no se sabe de antemano qué tramo sale de cada zona: tampoco aplican.
  var puntos = (motor === 'google' && !c.optimizarOrden)
    ? armarPuntosRuta_(oficina, limpias, c.puntosDePaso)
    : limpias.map(function (p) { return { lat: p.lat, lng: p.lng, esPaso: false }; });

  var clave = 'ruta:' + hash_(JSON.stringify({
    m: motor,
    o: [oficina.lat, oficina.lng],
    p: puntos.map(function (p) { return [p.lat, p.lng, p.esPaso ? 1 : 0]; }),
    opt: motor === 'google' && c.optimizarOrden
  }));
  var cache = CacheService.getScriptCache();
  var ruta;
  var guardada = cache.get(clave);
  if (guardada) {
    ruta = JSON.parse(guardada);
    ruta.desdeCache = true;
  } else {
    ruta = motor === 'osm'
      ? consultarOrs_(oficina, limpias, c.orsApiKey)
      : consultarDirecciones_(oficina, limpias, c.optimizarOrden, puntos);
    ruta.desdeCache = false;
    try { cache.put(clave, JSON.stringify(ruta), CACHE_SEGUNDOS); } catch (e) { /* > 100 KB: no se cachea */ }
  }
  // Los nombres visibles pueden cambiar sin cambiar la ruta: siempre los del pedido actual.
  if (motor === 'osm' || !c.optimizarOrden) ruta.paradas = limpias;

  ruta.motor = motor;
  ruta.conPuntosDePaso = puntos.some(function (p) { return p.esPaso; });
  // Con OpenStreetMap no hay un link público que muestre la misma ruta (varias paradas, ruta más corta):
  // queda solo el mapa. Con Google, el link lleva también los puntos de paso, para mostrar los mismos km.
  ruta.linkMapa = motor === 'osm' ? '' : armarLinkMapa_(oficina, c.optimizarOrden ? ruta.paradas : puntos);
  if (conMapa) ruta.mapaBase64 = mapaRutaBase64_(oficina, ruta.paradas, ruta.polyline);
  return ruta;
}

/** Valida y normaliza las paradas recibidas del cliente. */
function validarParadas_(paradas, maxParadas) {
  if (!Array.isArray(paradas) || paradas.length === 0) {
    throw new Error('Cargá al menos una parada.');
  }
  if (paradas.length > maxParadas) {
    throw new Error('Como máximo se pueden cargar ' + maxParadas + ' paradas por salida.');
  }
  return paradas.map(function (p, i) {
    var lat = aNumero_(p && p.lat);
    var lng = aNumero_(p && p.lng);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error('La parada ' + (i + 1) + ' no tiene una ubicación válida. Buscala de nuevo.');
    }
    if (!dentroDeSalta_(lat, lng)) {
      throw new Error('La parada ' + (i + 1) + ' está fuera de la provincia de Salta.');
    }
    return {
      nombre: textoLimpio_(p.nombre, 150) || textoLimpio_(p.direccion, 150) || ('Parada ' + (i + 1)),
      direccion: textoLimpio_(p.direccion, 250),
      place_id: textoLimpio_(p.place_id, 300),
      // 6 decimales ≈ 10 cm: suficiente y evita claves de cache distintas por ruido.
      lat: redondear_(lat, 6),
      lng: redondear_(lng, 6)
    };
  });
}

/** Distancia en línea recta en km (fórmula de haversine). */
function distanciaKm_(a, b) {
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLng = (b.lng - a.lng) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Lógica pura (testeable): puntos intermedios de la ruta, en orden, entre la salida y la vuelta a la oficina.
 * Son las paradas ({esPaso: false}) más los puntos de paso de la empresa ({esPaso: true}).
 * Un punto de paso se agrega antes de un destino cuando el tramo sale de una parada dentro de su zona,
 * el destino está fuera de la zona y el destino queda más al norte que el punto de paso.
 */
function armarPuntosRuta_(oficina, paradas, reglas) {
  var puntos = [];
  var secuencia = [oficina].concat(paradas).concat([oficina]);
  for (var i = 1; i < secuencia.length; i++) {
    var desde = secuencia[i - 1];
    var hasta = secuencia[i];
    if (i > 1) { // la oficina nunca está dentro de una zona: solo se mira cuando se sale de una parada
      (reglas || []).forEach(function (r) {
        var centro = { lat: r.zona.lat, lng: r.zona.lng };
        if (distanciaKm_(desde, centro) <= r.zona.radioKm &&
            distanciaKm_(hasta, centro) > r.zona.radioKm &&
            hasta.lat > r.paso.lat) {
          puntos.push({ lat: r.paso.lat, lng: r.paso.lng, esPaso: true });
        }
      });
    }
    if (i < secuencia.length - 1) puntos.push({ lat: hasta.lat, lng: hasta.lng, esPaso: false });
  }
  return puntos;
}

/**
 * Lógica pura (testeable): une los tramos que Google parte en un punto de paso, para que quede
 * un tramo por cada parada (oficina → parada 1 → … → oficina), con sus km completos.
 * @param {{desde, hasta, metros, segundos}[]} tramos uno por cada punto (paradas y pasos) + 1
 * @param {{esPaso: boolean}[]} puntos
 */
function unirTramosDePaso_(tramos, puntos) {
  var unidos = [];
  var actual = null;
  tramos.forEach(function (t, i) {
    if (actual) {
      actual.hasta = t.hasta;
      actual.metros += t.metros;
      actual.segundos += t.segundos;
    } else {
      actual = { desde: t.desde, hasta: t.hasta, metros: t.metros, segundos: t.segundos };
    }
    // Si este tramo termina en un punto de paso, sigue sumando al próximo.
    if (!(puntos[i] && puntos[i].esPaso)) {
      unidos.push(actual);
      actual = null;
    }
  });
  if (actual) unidos.push(actual);
  return unidos;
}

var ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

/**
 * Ruta en auto sobre OpenStreetMap con OpenRouteService, eligiendo la ruta más corta (no la más rápida).
 * Devuelve lo mismo que consultarDirecciones_: km, minutos, un tramo por parada y la polyline para el mapa.
 */
function consultarOrs_(oficina, paradas, apiKey) {
  var coords = [[oficina.lng, oficina.lat]]
    .concat(paradas.map(function (p) { return [p.lng, p.lat]; }))
    .concat([[oficina.lng, oficina.lat]]);
  var resp;
  try {
    resp = UrlFetchApp.fetch(ORS_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: apiKey, Accept: 'application/json' },
      payload: JSON.stringify({
        coordinates: coords,
        preference: 'shortest',
        units: 'm',
        language: 'es',
        instructions: false,
        geometry: true,
        radiuses: coords.map(function () { return 1000; }) // busca la calle más cercana hasta 1 km
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('OpenRouteService: ' + e.message);
    throw new Error('No se pudo consultar el mapa en este momento. Probá de nuevo más tarde.');
  }
  return leerRespuestaOrs_(resp.getResponseCode(), resp.getContentText(), paradas.length);
}

/** Lógica pura (testeable): interpreta la respuesta de OpenRouteService. */
function leerRespuestaOrs_(codigo, texto, cantidadParadas) {
  var datos;
  try { datos = JSON.parse(texto); } catch (e) { datos = null; }
  if (codigo !== 200 || !datos || !datos.routes || !datos.routes.length) {
    console.error('OpenRouteService ' + codigo + ': ' + String(texto).slice(0, 500));
    if (codigo === 429) throw new Error('Se alcanzó el límite de consultas al mapa por hoy. Avisá a Administración.');
    if (codigo === 401 || codigo === 403) throw new Error('El servicio de mapas rechazó la clave. Avisá a Administración.');
    var msg = datos && datos.error && (datos.error.message || datos.error);
    if (/routable point|could not find/i.test(String(msg))) {
      throw new Error('Alguna de las paradas está lejos de una calle transitable en auto. Elegila de nuevo más cerca de la calle.');
    }
    throw new Error('No se pudo calcular la ruta (' + codigo + ').');
  }
  var r = datos.routes[0];
  var segmentos = r.segments || [];
  if (segmentos.length !== cantidadParadas + 1) {
    throw new Error('No se pudo calcular la ruta (respuesta incompleta del mapa).');
  }
  var metros = 0;
  var segundos = 0;
  var legs = segmentos.map(function (s) {
    metros += s.distance || 0;
    segundos += s.duration || 0;
    return { desde: '', hasta: '', km: redondear_((s.distance || 0) / 1000, 1), duracionMin: Math.round((s.duration || 0) / 60) };
  });
  return {
    km: redondear_(metros / 1000, 1),
    duracionMin: Math.round(segundos / 60),
    legs: legs,
    polyline: typeof r.geometry === 'string' ? r.geometry : ''
  };
}

/** Lógica pura: decodifica una polyline (algoritmo de Google, precisión 5) a [[lat, lng], ...]. */
function decodificarPolyline_(texto) {
  var puntos = [];
  var i = 0, lat = 0, lng = 0;
  while (i < texto.length) {
    var valores = [];
    for (var k = 0; k < 2; k++) {
      var resultado = 0, corrimiento = 0, b;
      do {
        b = texto.charCodeAt(i++) - 63;
        resultado |= (b & 0x1f) << corrimiento;
        corrimiento += 5;
      } while (b >= 0x20 && i < texto.length);
      valores.push((resultado & 1) ? ~(resultado >> 1) : (resultado >> 1));
    }
    lat += valores[0];
    lng += valores[1];
    puntos.push([lat / 1e5, lng / 1e5]);
  }
  return puntos;
}

/** Lógica pura: codifica [[lat, lng], ...] como polyline (precisión 5). */
function codificarPolyline_(puntos) {
  var salida = '';
  var antLat = 0, antLng = 0;
  function codificar(v) {
    v = v < 0 ? ~(v << 1) : (v << 1);
    var s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  }
  puntos.forEach(function (p) {
    var la = Math.round(p[0] * 1e5), ln = Math.round(p[1] * 1e5);
    salida += codificar(la - antLat) + codificar(ln - antLng);
    antLat = la;
    antLng = ln;
  });
  return salida;
}

/**
 * Lógica pura: si la polyline es más larga que maxLargo, la simplifica salteando puntos muy cercanos
 * (se queda con uno cada N metros, cada vez más) hasta que entre. Siempre conserva el primero y el último.
 */
function acortarPolyline_(polyline, maxLargo) {
  if (!polyline || polyline.length <= maxLargo) return polyline;
  var puntos = decodificarPolyline_(polyline);
  for (var paso = 20; paso <= 2000; paso *= 1.5) {
    var elegidos = [puntos[0]];
    for (var i = 1; i < puntos.length - 1; i++) {
      var ult = elegidos[elegidos.length - 1];
      if (distanciaKm_({ lat: ult[0], lng: ult[1] }, { lat: puntos[i][0], lng: puntos[i][1] }) * 1000 >= paso) {
        elegidos.push(puntos[i]);
      }
    }
    elegidos.push(puntos[puntos.length - 1]);
    var corta = codificarPolyline_(elegidos);
    if (corta.length <= maxLargo) return corta;
  }
  return '';
}

/** Llama a DirectionFinder y arma el resultado. Lanza un error legible si Google no devuelve OK. */
function consultarDirecciones_(oficina, paradas, optimizar, puntos) {
  puntos = puntos || paradas.map(function (p) { return { lat: p.lat, lng: p.lng, esPaso: false }; });
  var df = Maps.newDirectionFinder()
    .setOrigin(oficina.lat, oficina.lng)
    .setDestination(oficina.lat, oficina.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setOptimizeWaypoints(!!optimizar)
    .setRegion('ar')
    .setLanguage('es');
  puntos.forEach(function (p) { df.addWaypoint(p.lat, p.lng); });

  var resp;
  try {
    resp = df.getDirections();
  } catch (e) {
    console.error('DirectionFinder: ' + e.message);
    throw new Error('No se pudo consultar Google Maps en este momento. Probá de nuevo más tarde.');
  }

  if (!resp || resp.status !== 'OK' || !resp.routes || !resp.routes.length) {
    var estado = resp && resp.status;
    var mensajes = {
      ZERO_RESULTS: 'Google Maps no encontró un camino en auto entre la oficina y alguna de las paradas.',
      NOT_FOUND: 'Alguna de las paradas no se pudo ubicar en el mapa.',
      MAX_WAYPOINTS_EXCEEDED: 'Hay demasiadas paradas para calcular la ruta.',
      OVER_QUERY_LIMIT: 'Se alcanzó el límite de consultas a Google Maps por hoy. Avisá a Administración.'
    };
    throw new Error(mensajes[estado] || ('No se pudo calcular la ruta (' + (estado || 'sin respuesta') + ').'));
  }

  var r = resp.routes[0];
  var orden = (optimizar && r.waypoint_order && r.waypoint_order.length === paradas.length)
    ? r.waypoint_order : paradas.map(function (_, i) { return i; });

  var tramos = r.legs.map(function (l) {
    return { desde: l.start_address, hasta: l.end_address, metros: l.distance.value, segundos: l.duration.value };
  });
  if (!optimizar) tramos = unirTramosDePaso_(tramos, puntos);

  var metros = 0;
  var segundos = 0;
  var legs = tramos.map(function (t) {
    metros += t.metros;
    segundos += t.segundos;
    return {
      desde: t.desde,
      hasta: t.hasta,
      km: redondear_(t.metros / 1000, 1),
      duracionMin: Math.round(t.segundos / 60)
    };
  });

  return {
    km: redondear_(metros / 1000, 1),
    duracionMin: Math.round(segundos / 60),
    paradas: orden.map(function (i) { return paradas[i]; }),
    legs: legs,
    polyline: (r.overview_polyline && r.overview_polyline.points) || ''
  };
}

/** Link a Google Maps con la misma ruta. */
function armarLinkMapa_(oficina, paradas) {
  var o = oficina.lat + ',' + oficina.lng;
  var wp = paradas.map(function (p) { return p.lat + ',' + p.lng; }).join('|');
  return 'https://www.google.com/maps/dir/?api=1' +
    '&origin=' + encodeURIComponent(o) +
    '&destination=' + encodeURIComponent(o) +
    '&waypoints=' + encodeURIComponent(wp) +
    '&travelmode=driving';
}

/**
 * Etiqueta del marcador de una parada. Static Maps solo admite un carácter,
 * así que la parada 10 se marca con "X".
 */
function etiquetaParada_(indice) {
  return indice < 9 ? String(indice + 1) : 'X';
}

/**
 * Mapa estático PNG en base64 (sin el prefijo data:). '' si no se pudo generar.
 * Si la polyline es muy larga para la URL, dibuja líneas rectas entre las paradas.
 */
function mapaRutaBase64_(oficina, paradas, polyline) {
  var clave = 'mapa:' + hash_(JSON.stringify([oficina, paradas.map(function (p) { return [p.lat, p.lng]; }), polyline]));
  var cache = CacheService.getScriptCache();
  var guardado = cache.get(clave);
  if (guardado) return guardado;

  var base64;
  try {
    var mapa = Maps.newStaticMap()
      .setSize(MAPA_ANCHO, MAPA_ALTO)
      .setLanguage('es')
      .setMapType(Maps.StaticMap.Type.ROADMAP);

    mapa.setMarkerStyle(Maps.StaticMap.MarkerSize.MID, '0x1A73E8', 'O').addMarker(oficina.lat, oficina.lng);
    paradas.forEach(function (p, i) {
      mapa.setMarkerStyle(Maps.StaticMap.MarkerSize.MID, '0xD93025', etiquetaParada_(i)).addMarker(p.lat, p.lng);
    });

    mapa.setPathStyle(4, '0x1A73E8CC', null);
    polyline = acortarPolyline_(polyline, MAX_LARGO_POLYLINE);
    if (polyline && polyline.length <= MAX_LARGO_POLYLINE) {
      mapa.addPath(polyline);
    } else {
      mapa.beginPath().addPoint(oficina.lat, oficina.lng);
      paradas.forEach(function (p) { mapa.addPoint(p.lat, p.lng); });
      mapa.addPoint(oficina.lat, oficina.lng).endPath();
    }
    base64 = Utilities.base64Encode(mapa.getBlob().getBytes());
  } catch (e) {
    console.error('StaticMap: ' + e.message);
    return ''; // el mapa es accesorio: sin mapa igual sale el PDF
  }
  try { cache.put(clave, base64, CACHE_SEGUNDOS); } catch (e) { /* > 100 KB: no se cachea */ }
  return base64;
}
