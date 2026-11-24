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

  var clave = 'ruta:' + hash_(JSON.stringify({
    o: [oficina.lat, oficina.lng],
    p: limpias.map(function (p) { return [p.lat, p.lng]; }),
    opt: c.optimizarOrden
  }));
  var cache = CacheService.getScriptCache();
  var ruta;
  var guardada = cache.get(clave);
  if (guardada) {
    ruta = JSON.parse(guardada);
    ruta.desdeCache = true;
  } else {
    ruta = consultarDirecciones_(oficina, limpias, c.optimizarOrden);
    ruta.desdeCache = false;
    try { cache.put(clave, JSON.stringify(ruta), CACHE_SEGUNDOS); } catch (e) { /* > 100 KB: no se cachea */ }
  }
  // Los nombres visibles pueden cambiar sin cambiar la ruta: siempre los del pedido actual.
  if (!c.optimizarOrden) ruta.paradas = limpias;

  ruta.linkMapa = armarLinkMapa_(oficina, ruta.paradas);
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

/** Llama a DirectionFinder y arma el resultado. Lanza un error legible si Google no devuelve OK. */
function consultarDirecciones_(oficina, paradas, optimizar) {
  var df = Maps.newDirectionFinder()
    .setOrigin(oficina.lat, oficina.lng)
    .setDestination(oficina.lat, oficina.lng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setOptimizeWaypoints(!!optimizar)
    .setRegion('ar')
    .setLanguage('es');
  paradas.forEach(function (p) { df.addWaypoint(p.lat, p.lng); });

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

  var metros = 0;
  var segundos = 0;
  var legs = r.legs.map(function (l) {
    metros += l.distance.value;
    segundos += l.duration.value;
    return {
      desde: l.start_address,
      hasta: l.end_address,
      km: redondear_(l.distance.value / 1000, 1),
      duracionMin: Math.round(l.duration.value / 60)
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
