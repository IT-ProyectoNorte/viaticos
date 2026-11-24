# Plan de trabajo (v2)

Marcar con [x] a medida que se completa. `[~]` = código escrito, falta probarlo en Apps Script.

## Fase 0 — Setup (manual, ver SETUP.md)
- [ ] Confirmar la cuenta dueña (`comunidad@proyectonorte.com.ar`)
- [ ] Proyecto Apps Script creado con `clasp` y código subido
- [ ] (Opcional) Logo subido a Drive y `LOGO_FILE_ID` cargado
- [ ] `validarConfig()` sin errores

## Fase 1 — Núcleo de cálculo
- [~] `Config.js`: oficina, dominio, límites de Salta, `validarConfig()`
- [~] `Util.js`: seguridad (`exigirDueno_`, `usuarioActual_`), fechas, números, escape HTML
- [~] `Rutas.js`: `buscarLugares_()` limitado a Salta, `calcularRuta_()` con cache y mapa estático
- [x] Tests de lógica pura (pasan en Node): `test_formatos`, `test_validarParadas`, `test_filtroSalta`, `test_htmlPdf`
- [~] Tests con Google Maps: `test_rutaBasica`, `test_busqueda`, `test_pdfCompleto`
- **Prueba:** correr `correrTests()` desde el editor. Abrir el link que deja `test_rutaBasica`, anotar los km de
  Google Maps en `TEST_KM_ESPERADO` y volver a correrlo (tolerancia ±2 %).

## Fase 2 — Web app y PDF
- [~] `WebApp.js`: `doGet`, `iniciar`, `buscarLugares`, `calcularSalida`, `descargarPdf`
- [~] `html/Index.html`: carga de salidas y paradas, recientes, borrador en el navegador, total y descarga.
      Probado en el navegador con un servidor simulado.
- [~] `Pdf.js`: PDF del día con tramos, km, mapa y total. Diseño revisado en el navegador.
- [ ] Probar la descarga real desde la web app publicada (Chrome y Edge)
- [ ] Revisar el PDF real: mapas, cortes de página con varias salidas y logo
- **Prueba:** 2 personas arman el día con 2 salidas cada una y suben el PDF a una solicitud de prueba en Humand.

## Fase 3 — Salida
- [ ] Agregar el link de la web app en el Portal de Servicios de Humand
- [ ] Instructivo de 1 página para empleados
- [ ] Piloto de 1 semana con 3 a 5 personas
- [ ] Ajustes y salida a todos
