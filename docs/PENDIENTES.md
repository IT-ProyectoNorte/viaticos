# Decisiones

Claude: si una decisión no está respondida, **preguntar**; no asumir.

## Respondidas

| # | Decisión | Respuesta |
|---|---|---|
| 1 | Oficina (salida y vuelta) | Office Park, San Lorenzo Chico, Salta · `-24.7979909, -65.4723851` |
| 2 | Google Workspace | Sí, `proyectonorte.com.ar` |
| 3 | Buscador de paradas | Escribir y elegir (Geocoder de Apps Script, sin costo), solo en la provincia de Salta |
| 4 | Orden de las paradas | El que carga el empleado |
| 5 | Frecuencia | Carga diaria, un PDF por día (24/11/2026: reemplaza al esquema quincenal) |
| 6 | Contenido del PDF | Solo km (sin tarifa ni monto), con mapa por salida |
| 7 | Registro | No se guarda nada; solo se genera el PDF |
| 8 | Identificación del empleado | Mail de la cuenta de Google y nombre que escribe una vez (lo recuerda el navegador) |
| 9 | Dispositivo | Mayormente compu: solo descarga directa, sin mail |
| 10 | Acceso | Link desde el Portal de Servicios de Humand |
| 11 | Cuenta dueña del script | `it@proyectonorte.com.ar` |
| 13 | Elegir parada en un mapa | Sí, con el mapa de Google (Maps JavaScript API con key de Google Cloud y facturación). Ver SETUP §2b |
| 12 | Forma de subir el código | A mano en el editor de Apps Script (24/11/2026). `clasp login` mostró un redirect a `localhoost` (con doble "o") que no se pudo explicar, así que no se autorizó |

## Abiertas

| # | Decisión | Default propuesto | Respuesta |
|---|---|---|---|
| B | Logo para el PDF | Pedir el archivo (PNG o JPG) | |
| C | ¿El link se abre en una pestaña nueva o dentro de Humand (iframe)? | Pestaña nueva. Dentro de un iframe, Google bloquea el inicio de sesión | |
| D | ¿Peajes o estacionamiento? | No (fuera de alcance) | |
| E | ¿Quién crea y administra la key del mapa y la facturación en Google Cloud? | IT, con la cuenta `it@` (SETUP §2b) | |
