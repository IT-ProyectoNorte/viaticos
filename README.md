# Viáticos por km — Proyecto Norte

Web app interna (Apps Script) a la que se entra desde un link en el Portal de Servicios de Humand.
Cada empleado carga las salidas del día (oficina → paradas en Salta → oficina). El sistema calcula los km
con Google Maps y descarga un PDF del día con los tramos, los km y el mapa de cada salida.
El empleado sube ese PDF a su solicitud en Humand, donde lo valida el gerente.

- Contexto para Claude Code: `CLAUDE.md`
- Especificación: `docs/ESPECIFICACION.md`
- Plan: `docs/PLAN.md` · Setup: `docs/SETUP.md` · Decisiones: `docs/PENDIENTES.md`

## Demo local (sin Google)

Para ver la pantalla y descargar un PDF de ejemplo sin publicar nada en Apps Script:

```bash
node demo/servidor.js
# abrir http://localhost:5178
```

Usa el código real de `src/` y reemplaza solo lo que depende de Google: la búsqueda (lista fija de lugares de Salta),
los km (aproximados) y el mapa (esquema). El PDF lo genera Edge o Chrome en modo headless.
