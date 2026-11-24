# Viáticos por km — Proyecto Norte

Web app para que cada empleado que usa su auto particular cargue los recorridos del día y descargue un PDF
con los km, que después sube a su solicitud en el Portal de Servicios de Humand.
Todo en Google: **Apps Script (web app independiente) + Google Maps**. No hay planilla.

## Contexto de negocio (no cambiar sin consultar)

- **Carga diaria, un PDF por día** con todas las salidas de ese día.
- **Toda salida sale de la oficina y vuelve a la oficina** (Office Park, San Lorenzo Chico, Salta). El empleado solo carga las paradas.
- **Solo paradas en la provincia de Salta.** **Se respeta el orden cargado** (no se optimiza).
- Los km salen de la **ruta en auto de Google Maps**, nunca los declara el empleado. El servidor recalcula todo antes de armar el PDF.
- El PDF muestra **solo km** (sin montos) e incluye el mapa de cada salida.
- **No se guarda registro.** El gerente valida en Humand; Administración paga con la tarifa vigente fuera del sistema.
- El link a la web app está en el Portal de Servicios de Humand. Se usa mayormente desde la compu.

## Documentación

- `docs/ESPECIFICACION.md`: especificación funcional y técnica (v2).
- `docs/PLAN.md`: plan por fases con checklist. **Actualizarlo a medida que se avanza.**
- `docs/SETUP.md`: pasos manuales (clasp, logo, deploy, Humand).
- `docs/PENDIENTES.md`: decisiones tomadas y abiertas. **No asumir: preguntar al usuario.**

## Stack y convenciones

- Apps Script runtime V8, JavaScript plano (sin TypeScript ni bundler). Desarrollo local con `clasp` (`rootDir: src`).
- Archivos: `Config.js` (constantes + `validarConfig()`), `Util.js`, `Rutas.js` (búsqueda + ruta + mapa), `Pdf.js`, `WebApp.js`, `Tests.js`, `html/Index.html`.
- Nombres de funciones y variables en español, en camelCase. Las funciones privadas terminan en `_` (así no se exponen a `google.script.run`).
- Toda función pública de la web app empieza con `usuarioActual_()`. Toda función pública de editor (validación, tests) empieza con `exigirDueno_()`: la web app corre como la cuenta dueña y cualquier usuario del dominio podría invocar funciones públicas.
- Separar la lógica pura de las llamadas a Google (por ejemplo `filtrarResultadosSalta_`, `htmlPdf_`) para poder testearla sin cuota.
- En la pantalla, los datos se insertan con `textContent` (nunca `innerHTML` con datos). En el PDF, todo pasa por `escaparHtml_()`.
- Fechas en zona `America/Argentina/Buenos_Aires`. km con 1 decimal.
- Tests: funciones `test_*` en `src/Tests.js`, todas juntas con `correrTests()` desde el editor o con `clasp run`.
- Idioma de la interfaz: español rioplatense y simple.

## Comandos

```bash
clasp push            # subir código
clasp open            # abrir editor
clasp deploy -i <DEPLOYMENT_ID> -d "descripcion"   # actualizar la web app sin cambiar la URL
clasp logs            # ver logs
```
