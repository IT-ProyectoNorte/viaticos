# Setup

No hace falta planilla ni carpeta de Drive: el script es independiente.
Cuenta dueña: **`it@proyectonorte.com.ar`**. Todo lo que sigue se hace con esa cuenta.

## 1. Crear el proyecto y pegar el código (a mano)

1. Entrar a <https://script.google.com> con `it@proyectonorte.com.ar` → **Nuevo proyecto**.
2. Renombrarlo (arriba a la izquierda): **Viáticos km - Proyecto Norte**.
3. **Configuración del proyecto** (engranaje) → tildar **Mostrar el archivo de manifiesto "appsscript.json" en el editor**.
4. Volver al **Editor** (`< >`) y crear los archivos. En el editor se llaman `.gs`, pero el contenido es el mismo que el de los `.js`:

   | En el editor | Copiar desde | Cómo crearlo |
   |---|---|---|
   | `appsscript.json` | `src/appsscript.json` | Ya existe: reemplazar todo el contenido |
   | `Código.gs` → renombrar a `Config` | `src/Config.js` | Ya existe: renombrar y reemplazar el contenido |
   | `Util` | `src/Util.js` | **+** → Secuencia de comandos |
   | `Rutas` | `src/Rutas.js` | **+** → Secuencia de comandos |
   | `Pdf` | `src/Pdf.js` | **+** → Secuencia de comandos |
   | `WebApp` | `src/WebApp.js` | **+** → Secuencia de comandos |
   | `Tests` | `src/Tests.js` | **+** → Secuencia de comandos |
   | `Index` | `src/Index.html` | **+** → HTML (escribir solo `Index`, sin `.html`) |

5. Guardar (Ctrl+S).

El orden de los archivos no importa. Si se cambia algo del código, se cambia también acá en el repo y se vuelve a pegar el archivo.

## 2. Logo (opcional)
1. Subir el logo (PNG o JPG, idealmente de menos de 200 KB) al Drive de la cuenta dueña.
2. Copiar el ID del archivo (la parte de la URL entre `/d/` y `/view`).
3. Configuración del proyecto → Propiedades del script → `LOGO_FILE_ID` = ese ID.

## 2b. Mapa de Google para "Elegir en el mapa" (MAPS_API_KEY)
Sin esta key todo funciona igual, pero no aparece el botón **📍 Elegir en el mapa**.
Los km no dependen de esta key: los sigue calculando el servicio Maps de Apps Script.

1. En <https://console.cloud.google.com> (con `it@`): crear un proyecto, por ejemplo **viaticos-km**.
2. **Facturación**: vincular una cuenta de facturación. La Maps JavaScript API tiene un cupo mensual sin costo;
   verificar el vigente en la página de precios de Google Maps Platform.
3. **APIs y servicios → Biblioteca** → habilitar **Maps JavaScript API** (solo esa).
4. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**, y editarla:
   - Restricciones de aplicación: **Sitios web (referentes HTTP)**:
     - `https://*.googleusercontent.com/*`
     - `https://script.google.com/*`
   - Restricciones de API: **Restringir clave** → solo **Maps JavaScript API**.
5. (Recomendado) **Facturación → Presupuestos y alertas**: crear un presupuesto chico con aviso por mail.
6. En Apps Script: Configuración del proyecto → Propiedades del script → `MAPS_API_KEY` = la key.
7. Recargar la web app: tiene que aparecer el botón del mapa.

La key la ve el navegador (es inevitable en un mapa web). Por eso las restricciones del paso 4 son obligatorias:
con ellas solo funciona desde la web app y solo para mostrar el mapa.

Para probar el mapa de Google en la demo local, agregar también `http://localhost:5178/*` a los referentes y correr
`$env:MAPS_API_KEY='la-key'; node demo/servidor.js` (sin key, la demo usa un mapa de muestra de OpenStreetMap).

## 2c. Km desde OpenStreetMap (ORS_API_KEY)

Con esta key los km salen de **OpenStreetMap**, con la **ruta en auto más rápida** (OpenRouteService, igual que openstreetmap.org).
Sin key, el sistema sigue calculando con Google Maps.

1. Crear una cuenta gratuita en https://openrouteservice.org (hoy redirige a playground.heigit.org) con un mail de la empresa.
2. En el panel, **Request a token** (tipo *Standard*, gratuito: ~2.000 rutas por día).
3. En Apps Script: **Configuración del proyecto → Propiedades del script → Agregar propiedad**:
   `ORS_API_KEY` = el token.
4. Correr `validarConfig()`: tiene que mostrar "Km desde OpenStreetMap: OK" con los km a la Plaza 9 de Julio.

Para volver a Google Maps alcanza con borrar la propiedad `ORS_API_KEY`.
Si falta una calle en OpenStreetMap, se puede agregar desde https://www.openstreetmap.org (botón **Editar**).

## 3. Pruebas
1. En el editor, elegir el archivo `Config`, la función `validarConfig` y **Ejecutar**.
   La primera vez pide permisos: revisar que la cuenta sea `it@` y aceptar.
   Si aparece "Google no verificó esta app", es normal en scripts propios: Configuración avanzada → Ir a "Viáticos km".
2. Ver el **Registro de ejecución**: todo tiene que salir con ✔.
3. Elegir `Tests` → `correrTests` → **Ejecutar** y revisar el registro.
4. Copiar el link que deja `test_rutaBasica`, abrirlo, anotar los km que muestra Google Maps en `TEST_KM_ESPERADO`
   (archivo `Tests`) y volver a correr `test_rutaBasica`.

## 4. Deploy de la web app
**Implementar → Nueva implementación** → tipo **Aplicación web**:
- Descripción: `v1`
- Ejecutar como: **Yo (it@proyectonorte.com.ar)**
- Quién tiene acceso: **Cualquier usuario de proyectonorte.com.ar**

Copiar la **URL de la aplicación web** (termina en `/exec`).
Para actualizarla sin que cambie la URL: **Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión**.
Nunca crear una "Nueva implementación" para actualizar: eso genera otra URL y rompe el link de Humand y del subdominio.

**Implementación actual** (versión 6 del 25/11/2026: km desde OpenStreetMap con la ruta más rápida; v5 OpenStreetMap ruta más corta; v4 colectora de La Arbolada, v3 estética de Proyecto Norte; misma URL desde la v1):
- Proyecto: `https://script.google.com/home/projects/12wdH_i5GFZX28SokR1oyZjuXTtpALkKEuhwRRlGC_7ncCDETS49MrQnX/edit`
- Web app: `https://script.google.com/a/macros/proyectonorte.com.ar/s/AKfycbxLFH1oeusuhtxGpbnVnJRRU5J354tytp2t-xq3M9VncBfFlD9AsAUBpZBh6AtlGwwP/exec`

## 5. Humand
Agregar el link (`https://viaticos.proyectonorte.com.ar` cuando esté el subdominio, o la URL de la web app) en el
Portal de Servicios, para que se abra en una pestaña nueva.

## 6. Subdominio viaticos.proyectonorte.com.ar (Cloudflare Pages + CNAME en GoDaddy)
Apps Script no admite dominios propios, así que el subdominio **redirige** (302) a la URL de la web app.
El reenvío de GoDaddy no está disponible para este dominio (.com.ar con "DNS hosting"), por eso se usa
Cloudflare Pages con la carpeta `redireccion/` del repo (`_redirects` + `index.html` de respaldo).
El DNS sigue en GoDaddy: no hace falta mover el dominio a Cloudflare.

Configuración actual (funcionando desde el 25/11/2026): proyecto de **Pages** `viaticos` conectado al repo `IT-ProyectoNorte/viaticos`,
dirección interna `viaticos-1qi.pages.dev`.

1. Cloudflare → **Workers & Pages** → proyecto de Pages `viaticos` → **Settings → Build**:
   - Build command: **vacío**
   - **Build output directory: `redireccion`** (importante: si queda en la raíz, Pages publica todo el repo)
   - Root directory: vacío (raíz del repo)
2. **Deployments → Retry deployment** (o hacer un push a `main`) y probar `https://viaticos-1qi.pages.dev`:
   tiene que llevar a la web app, y `https://viaticos-1qi.pages.dev/README.md` tiene que dar 404.
3. **Custom domains** → `viaticos.proyectonorte.com.ar`.
4. GoDaddy → **Administrar registros DNS**: `CNAME` `viaticos` → `viaticos-1qi.pages.dev`. No tocar otros registros.

Si cambia la URL de la web app: editar `redireccion/_redirects` e `index.html` y hacer push a `main`
(Pages vuelve a publicar solo).

## Alternativa: clasp
Con `clasp` (`npm install -g @google/clasp`, `clasp login`, `clasp create --type standalone --rootDir src`, `clasp push`)
se sube todo de una vez. Quedó en pausa: en la primera prueba, `clasp login` mostró un redirect a `localhoost`
(con doble "o") que no se pudo explicar (ver PENDIENTES #12). Revisarlo antes de autorizar.
