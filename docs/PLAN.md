# Plan de trabajo (v2)

Marcar con [x] a medida que se completa. `[~]` = hecho en parte o falta probarlo.

## Fase 0 — Setup (manual, ver SETUP.md)
- [x] Cuenta dueña: `it@proyectonorte.com.ar`
- [x] Proyecto Apps Script creado y código cargado (24/11/2026, a mano en el editor)
- [x] `MAPS_API_KEY` cargada (proyecto de Google Cloud con Maps JavaScript API)
- [ ] Revisar restricciones de la key: referentes, solo Maps JavaScript API, cuota diaria y alerta de presupuesto (SETUP §2b)
- [ ] (Opcional) Logo subido a Drive y `LOGO_FILE_ID` cargado
- [x] `validarConfig()` sin errores (24/11/2026)

## Fase 1 — Núcleo de cálculo
- [x] `Config.js`: oficina, dominio, límites de Salta, `validarConfig()`
- [x] `Util.js`: seguridad (`exigirDueno_`, `usuarioActual_`), fechas, números, escape HTML
- [x] `Rutas.js`: búsqueda limitada a Salta, links de Google Maps y coordenadas, `calcularRuta_()` con cache y mapa estático
- [x] `correrTests()` en Apps Script: 8 de 8 OK (24/11/2026)
- [~] `TEST_KM_ESPERADO` sin cargar: Google Maps web da otra ruta según el tráfico y los cortes del momento
      (24/11: web 24,2 km evitando un corte en Canova; el sistema 20,9 km sin tráfico). Decidir contra qué comparar.

## Fase 2 — Web app y PDF
- [x] `WebApp.js`: `doGet`, `iniciar`, `buscarLugares`, `lugarEnPunto`, `calcularSalida`, `descargarPdf`
- [x] `Index.html`: salidas y paradas, búsqueda, links de Maps, "Elegir en el mapa" (Google), recientes, borrador, total y descarga
- [x] `Pdf.js`: PDF del día con tramos, km, mapa de Google y total
- [x] Publicada (v1, 24/11/2026) para cualquier usuario de proyectonorte.com.ar — ver SETUP §4
- [x] Versión 2 (25/11/2026): estética de Proyecto Norte (logo, Montserrat, carbón y rojo), misma URL
- [x] Versión 3 (25/11/2026): PDF con la estética de Proyecto Norte (logo a color, línea roja, total destacado)
- [x] Probada de punta a punta en la web app publicada: mapa de Google, parada por clic, ruta real (22,7 km) y descarga del PDF
- [ ] Probar la descarga en Edge y desde otra cuenta del dominio (no dueña)
- [ ] Revisar el PDF real con varias salidas (cortes de página); el logo ya sale (se toma de viaticos.proyectonorte.com.ar)
- **Prueba:** 2 personas arman el día con 2 salidas cada una y suben el PDF a una solicitud de prueba en Humand.

- [x] Punto de paso por la colectora para la vuelta desde La Arbolada (tests de lógica pura OK)
- [x] Versión 4 (25/11/2026): vuelta por la colectora desde La Arbolada (probado en /dev: finca el ceibal 18,9 → 12,9 km)
- [x] Km desde OpenStreetMap (OpenRouteService, ruta más corta) con `ORS_API_KEY`; sin key sigue Google
- [x] Versión 5 (25/11/2026): km desde OpenStreetMap con `ORS_API_KEY` cargada (probado: La Cercanía, La Arbolada, Plaza 9 de Julio)
- [ ] Probar un recorrido largo fuera de San Lorenzo con OpenStreetMap
- [x] Ruta más rápida en vez de la más corta (25/11/2026): ida y vuelta por avenidas, como openstreetmap.org. Probado en /dev: finca el ceibal 13,5 km, La Cercanía 3,2 km, Bº FEPUSA 26,4 km (antes 21,6 con ida por calles internas). Publicada como versión 6
- [x] Lugares con nombre: "De la empresa" (`CONFIG.lugaresEmpresa`) y "Mis lugares" de cada empleado (☆). Cargado en /dev
- [x] Cargar la lista de lugares de la empresa (9 lugares, probados en /dev)
- [ ] Publicar versión 7

## Fase 3 — Salida
- [x] `https://viaticos.proyectonorte.com.ar` publicado (25/11/2026): bienvenida con la estética de Proyecto Norte en Cloudflare Pages, entra sola a la web app (SETUP §6)
- [ ] Agregar `https://viaticos.proyectonorte.com.ar` en el Portal de Servicios de Humand
- [ ] Instructivo de 1 página para empleados
- [ ] Piloto de 1 semana con 3 a 5 personas
- [ ] Ajustes y salida a todos
