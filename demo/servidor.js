/**
 * Demo local de la web app, sin Apps Script ni Google Maps.
 *
 *   node demo/servidor.js        → abrir http://localhost:5178
 *
 * Corre el código REAL de src/ (validaciones, límite de Salta, armado del día y HTML del PDF) y reemplaza
 * solo lo que depende de Google:
 *   - Búsqueda: lista fija de lugares de Salta (coordenadas aproximadas).
 *   - Km: distancia en línea recta × 1,35 (aproximación; el sistema real usa la ruta en auto de Google Maps).
 *   - Mapa: esquema SVG (el sistema real usa el mapa de Google).
 *   - PDF: Microsoft Edge o Google Chrome en modo headless (Apps Script usa su propio conversor).
 * No se usa en producción: clasp solo sube la carpeta src/.
 */
'use strict';

var http = require('http');
var fs = require('fs');
var os = require('os');
var path = require('path');
var vm = require('vm');
var childProcess = require('child_process');

var PUERTO = Number(process.env.PORT) || 5178;
var SRC = path.join(__dirname, '..', 'src');
var EMAIL_DEMO = 'demo@proyectonorte.com.ar';

// ---------------------------------------------------------------------------
// Lugares de prueba (coordenadas aproximadas)
// ---------------------------------------------------------------------------
var LUGARES = [
  ['Plaza 9 de Julio', 'Plaza 9 de Julio, Salta Capital', -24.789040, -65.410380],
  ['Aeropuerto Martín Miguel de Güemes', 'RN 51 km 5, Salta Capital', -24.856000, -65.486200],
  ['Terminal de Ómnibus', 'Av. Hipólito Yrigoyen, Salta Capital', -24.795500, -65.401300],
  ['Hospital San Bernardo', 'Tobías 69, Salta Capital', -24.783500, -65.404500],
  ['Parque Industrial', 'Parque Industrial, Salta Capital', -24.830000, -65.420000],
  ['Cerrillos — plaza principal', 'Cerrillos, Salta', -24.898700, -65.487400],
  ['La Merced', 'La Merced, Cerrillos, Salta', -24.966700, -65.488100],
  ['Rosario de Lerma', 'Rosario de Lerma, Salta', -24.979700, -65.580600],
  ['Campo Quijano', 'Campo Quijano, Rosario de Lerma, Salta', -24.908600, -65.637000],
  ['Vaqueros', 'Vaqueros, La Caldera, Salta', -24.695000, -65.405000],
  ['San Lorenzo — plaza', 'Villa San Lorenzo, Salta', -24.731300, -65.486500],
  ['General Güemes', 'General Güemes, Salta', -24.666700, -65.050000],
  ['San Salvador de Jujuy (fuera de Salta)', 'San Salvador de Jujuy, Jujuy', -24.185800, -65.299500]
].map(function (l, i) {
  return { nombre: l[0], direccion: l[1], place_id: 'demo-' + i, lat: l[2], lng: l[3], aproximado: false };
});

// ---------------------------------------------------------------------------
// Contexto con el código real de src/ y stubs de Apps Script
// ---------------------------------------------------------------------------
function crearContexto() {
  var ctx = {
    console: console,
    Session: {
      getActiveUser: function () { return { getEmail: function () { return EMAIL_DEMO; } }; },
      getEffectiveUser: function () { return { getEmail: function () { return EMAIL_DEMO; } }; }
    },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'MAPS_API_KEY' ? (process.env.MAPS_API_KEY || null) : null; } }; } },
    Utilities: { formatDate: formatearFecha }
  };
  vm.createContext(ctx);
  ['Config.js', 'Util.js', 'Rutas.js', 'Pdf.js', 'WebApp.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

  // Mapa para elegir paradas: con MAPS_API_KEY en el entorno se usa el de Google; si no, uno de muestra (OpenStreetMap).
  var iniciarReal = ctx.iniciar;
  ctx.iniciar = function () {
    var info = iniciarReal();
    info.mapaDemo = !info.mapsApiKey;
    return info;
  };

  // Reemplazos de lo que depende de Google. buscarLugares_ (lectura de links y coordenadas) es el real.
  ctx.buscarPorTexto_ = function (texto) {
    var q = normalizar(String(texto || '').trim());
    if (q.length < 3) throw new Error('Escribí al menos 3 letras para buscar.');
    var encontrados = LUGARES.filter(function (l) {
      return normalizar(l.nombre + ' ' + l.direccion).indexOf(q) >= 0;
    });
    var enSalta = encontrados.filter(function (l) {
      // Igual que el sistema real: solo provincia de Salta.
      return ctx.dentroDeSalta_(l.lat, l.lng) && !/jujuy/i.test(l.direccion);
    });
    if (!enSalta.length && !encontrados.length) {
      throw new Error('DEMO: la búsqueda por texto solo conoce una lista fija (plaza, cerrillos, aeropuerto, lerma, ' +
        'vaqueros…). Probá pegando un link de Google Maps o coordenadas. En el sistema real se busca en Google Maps.');
    }
    return enSalta;
  };

  ctx.lugarDesdeCoordenadas_ = function (u) {
    if (!isFinite(u.lat) || !isFinite(u.lng) || !ctx.dentroDeSalta_(u.lat, u.lng)) {
      throw new Error('Ese punto está fuera de la provincia de Salta.');
    }
    var coords = ctx.redondear_(u.lat, 6) + ', ' + ctx.redondear_(u.lng, 6);
    return [{
      nombre: ctx.textoLimpio_(u.nombre, 150) || ('Punto ' + coords),
      direccion: coords + ' (DEMO: en el sistema real se muestra la dirección)',
      place_id: '', lat: ctx.redondear_(u.lat, 6), lng: ctx.redondear_(u.lng, 6), aproximado: false
    }];
  };

  // Links cortos: se siguen las redirecciones con un proceso aparte (la demo es sincrónica, como Apps Script).
  ctx.resolverLinkCorto_ = function (url) {
    var script = 'let u=process.argv[1];(async()=>{for(let i=0;i<5;i++){' +
      'if(!/^https?:\\/\\/((maps\\.app\\.)?goo\\.gl|([a-z0-9-]+\\.)*google\\.[a-z.]+)\\//i.test(u))break;' +
      'const r=await fetch(u,{redirect:"manual"});const l=r.headers.get("location");if(!l)break;u=l;' +
      'if(/google\\.[a-z.]+\\/maps/i.test(u)&&!/goo\\.gl/i.test(u))break;}process.stdout.write(u)})()' +
      '.catch(()=>process.exit(1))';
    try {
      return childProcess.execFileSync(process.execPath, ['-e', script, url], { timeout: 15000 }).toString();
    } catch (e) {
      throw new Error('No se pudo abrir el link de Google Maps. Probá de nuevo.');
    }
  };

  ctx.calcularRuta_ = function (paradas) {
    var c = ctx.obtenerConfig_();
    var limpias = ctx.validarParadas_(paradas, c.maxParadas); // validación real (incluye Salta)
    var puntos = [c.oficina].concat(limpias).concat([c.oficina]);
    var legs = [];
    var total = 0;
    for (var i = 0; i < puntos.length - 1; i++) {
      var km = ctx.redondear_(distanciaKm(puntos[i], puntos[i + 1]) * 1.35, 1);
      total += km;
      legs.push({ desde: '', hasta: '', km: km, duracionMin: Math.round(km * 1.6) });
    }
    total = ctx.redondear_(total, 1);
    return {
      km: total,
      duracionMin: Math.round(total * 1.6),
      paradas: limpias,
      legs: legs,
      polyline: '',
      linkMapa: ctx.armarLinkMapa_(c.oficina, limpias),
      mapaBase64: Buffer.from(mapaSvg(c.oficina, limpias)).toString('base64'),
      mapaTipo: 'image/svg+xml',
      desdeCache: false
    };
  };

  ctx.generarPdfDia_ = function (dia) {
    var logo = path.join(__dirname, '..', 'redireccion', 'logo-proyecto-norte.png');
    var html = ctx.htmlPdf_(dia, fs.existsSync(logo) ? 'data:image/png;base64,' + fs.readFileSync(logo).toString('base64') : '');
    var nombreArchivo = 'Recorridos_' + dia.fecha + '_' + dia.email.split('@')[0] + '.pdf';
    return { nombreArchivo: nombreArchivo, base64: htmlAPdf(html).toString('base64'), kmTotal: dia.kmTotal };
  };
  return ctx;
}

function normalizar(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function formatearFecha(fecha, zona, patron) {
  var p = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(fecha).forEach(function (x) { p[x.type] = x.value; });
  return patron.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day)
    .replace('HH', p.hour === '24' ? '00' : p.hour).replace('mm', p.minute);
}

function distanciaKm(a, b) {
  var R = 6371;
  var rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad;
  var dLng = (b.lng - a.lng) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Esquema del recorrido en SVG (640×400): oficina, paradas numeradas y líneas en orden. */
function mapaSvg(oficina, paradas) {
  var todos = [oficina].concat(paradas);
  var lats = todos.map(function (p) { return p.lat; });
  var lngs = todos.map(function (p) { return p.lng; });
  var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
  var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
  var spanLat = Math.max(maxLat - minLat, 0.01), spanLng = Math.max(maxLng - minLng, 0.01);
  var esc = Math.min(560 / spanLng, 300 / spanLat);
  var cx = 320 - ((minLng + maxLng) / 2) * esc;
  var cy = 200 + ((minLat + maxLat) / 2) * esc;
  function xy(p) { return [(cx + p.lng * esc).toFixed(1), (cy - p.lat * esc).toFixed(1)]; }
  var ruta = [oficina].concat(paradas).concat([oficina]).map(function (p) { return xy(p).join(','); }).join(' ');
  var marcas = paradas.map(function (p, i) {
    var c = xy(p);
    return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="13" fill="#d93025"/>' +
      '<text x="' + c[0] + '" y="' + (Number(c[1]) + 5) + '" font-size="14" font-weight="bold" fill="#fff" text-anchor="middle">' +
      (i < 9 ? i + 1 : 'X') + '</text>';
  }).join('');
  var o = xy(oficina);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" font-family="Arial">' +
    '<rect width="640" height="400" fill="#eef3ea"/>' +
    '<polyline points="' + ruta + '" fill="none" stroke="#1a73e8" stroke-width="4" stroke-linejoin="round" opacity=".85"/>' +
    marcas +
    '<circle cx="' + o[0] + '" cy="' + o[1] + '" r="13" fill="#1a73e8"/>' +
    '<text x="' + o[0] + '" y="' + (Number(o[1]) + 5) + '" font-size="14" font-weight="bold" fill="#fff" text-anchor="middle">O</text>' +
    '<rect x="0" y="372" width="640" height="28" fill="#fff" opacity=".85"/>' +
    '<text x="10" y="391" font-size="13" fill="#5f6368">DEMO: esquema aproximado. En el sistema real va el mapa de Google con la ruta en auto.</text>' +
    '</svg>';
}

// ---------------------------------------------------------------------------
// HTML → PDF con Edge o Chrome headless
// ---------------------------------------------------------------------------
function buscarNavegador() {
  var candidatos = [
    process.env.NAVEGADOR,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
  ];
  for (var i = 0; i < candidatos.length; i++) {
    if (candidatos[i] && fs.existsSync(candidatos[i])) return candidatos[i];
  }
  throw new Error('No encontré Edge ni Chrome para generar el PDF. Definí la variable NAVEGADOR con la ruta.');
}

function htmlAPdf(html) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viaticos-demo-'));
  try {
    var entrada = path.join(dir, 'dia.html');
    var salida = path.join(dir, 'dia.pdf');
    fs.writeFileSync(entrada, html, 'utf8');
    childProcess.execFileSync(buscarNavegador(), [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer',
      '--user-data-dir=' + path.join(dir, 'perfil'),
      '--print-to-pdf=' + salida,
      'file:///' + entrada.replace(/\\/g, '/')
    ], { stdio: 'ignore', timeout: 60000 });
    // En Windows, msedge.exe puede devolver el control antes de terminar de escribir el PDF.
    var espera = new Int32Array(new SharedArrayBuffer(4));
    var tamAnterior = -1;
    for (var i = 0; i < 150; i++) {
      var tam = fs.existsSync(salida) ? fs.statSync(salida).size : -1;
      if (tam > 0 && tam === tamAnterior) break; // existe y dejó de crecer
      tamAnterior = tam;
      Atomics.wait(espera, 0, 0, 200);
    }
    if (!fs.existsSync(salida)) throw new Error('El navegador no generó el PDF.');
    return fs.readFileSync(salida);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
var FUNCIONES_PUBLICAS = ['iniciar', 'buscarLugares', 'lugarEnPunto', 'calcularSalida', 'descargarPdf'];

function paginaIndex() {
  var html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  var shim = fs.readFileSync(path.join(__dirname, 'google-script-run.js'), 'utf8');
  var banda = '<div style="background:#fef7e0;color:#7a4f01;padding:8px 16px;font-size:13px;border-bottom:1px solid #f9e1a8">' +
    '<b>Modo demo:</b> los km son aproximados y el mapa es un esquema. Buscá "plaza", "cerrillos", "aeropuerto" o "lerma", o pegá un link de Google Maps.</div>';
  return html
    .replace('<base target="_top">', '<meta name="viewport" content="width=device-width, initial-scale=1"><script>' + shim + '</script>')
    .replace('<main id="app">', banda + '<main id="app">');
}

http.createServer(function (req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(paginaIndex());
  }
  var m = req.url.match(/^\/api\/(\w+)$/);
  if (req.method === 'POST' && m && FUNCIONES_PUBLICAS.indexOf(m[1]) >= 0) {
    var cuerpo = '';
    req.setEncoding('utf8');
    req.on('data', function (d) { cuerpo += d; });
    req.on('end', function () {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        var ctx = crearContexto(); // se relee src/ en cada pedido: los cambios se ven sin reiniciar
        var resultado = ctx[m[1]].apply(null, JSON.parse(cuerpo || '[]'));
        res.end(JSON.stringify({ ok: true, resultado: resultado }));
      } catch (e) {
        console.error(m[1] + ': ' + e.message);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(PUERTO, '127.0.0.1', function () {
  console.log('Demo en http://localhost:' + PUERTO);
});
