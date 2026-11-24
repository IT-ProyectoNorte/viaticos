# Especificación — Viáticos por km (v2, 24/11/2026)

> **Cambio de alcance (24/11/2026):** se dejó de lado el esquema de períodos quincenales, cierre automático,
> planilla de registro, tarifas y mails. Ahora el sistema solo calcula los km del día y entrega un PDF.
> El control y el pago quedan en Humand.

## 1. Actores

| Actor | Qué hace | Dónde |
|---|---|---|
| Empleado | Carga las salidas del día, descarga el PDF y lo sube a su solicitud | Web app (link desde el Portal de Servicios de Humand) + Humand |
| Gerente | Valida la solicitud con el PDF adjunto | Humand (fuera de este sistema) |
| Administración | Calcula el pago con la tarifa vigente a partir de los km del PDF | Fuera de este sistema |

## 2. Flujo

```
Portal de Servicios (Humand) ──link──→ Web app (Apps Script)
                                        1. Nombre y fecha
                                        2. Por cada salida: paradas en orden → "Calcular km" → km + mapa
                                        3. "Descargar PDF" → el servidor recalcula todo y arma 1 PDF del día
Empleado sube el PDF a su solicitud ←───┘
Gerente valida en Humand
```

## 3. Reglas

- **Toda salida arranca y termina en la oficina**: Office Park, San Lorenzo Chico, Salta (`-24.7979909, -65.4723851`).
- **Solo paradas en la provincia de Salta.** El buscador descarta resultados de otras provincias y el servidor rechaza coordenadas fuera del rectángulo de Salta.
- **Se respeta el orden en que el empleado cargó las paradas** (no se optimiza).
- Los km salen de la **ruta en auto de Google Maps**. El empleado no los declara.
- **Un PDF por día**, con todas las salidas de ese día (hasta 8 salidas de hasta 10 paradas cada una).
- El PDF muestra **solo km**, sin montos.
- **No se guarda ningún registro.** Solo queda una línea por PDF en los registros de ejecución de Apps Script (mail, fecha, cantidad de salidas y km totales), que se borran solos según la retención de Google.
- La fecha no puede ser futura ni de más de 31 días atrás.
- El servidor **recalcula todas las rutas al generar el PDF**: nunca usa km enviados por el navegador.

## 4. Web app

Deploy: **Ejecutar como: Yo (cuenta dueña)** y **Acceso: cualquier usuario de proyectonorte.com.ar**.
El mail del empleado sale de `Session.getActiveUser()` y no se puede cambiar. Si no es del dominio, se rechaza.

Pantalla única:
1. **Nombre y apellido**: lo escribe una vez y el navegador lo recuerda (`localStorage`).
2. **Fecha**: hoy por defecto.
3. **Salidas** (tarjeta por salida):
   - Motivo u obra (opcional).
   - Origen y destino fijos = Oficina (no editables).
   - Buscador: escribe una dirección o lugar → **Buscar** → elige entre las coincidencias de Salta. Las coincidencias aproximadas se marcan como tales.
   - Chips de "Usados hace poco" (los últimos 12 lugares, guardados en el navegador).
   - Paradas ordenables (↑ ↓) y quitables (✕).
   - **Calcular km** → muestra km, minutos estimados, mapa y link a Google Maps. Si se cambian las paradas, hay que recalcular.
4. **+ Agregar otra salida**.
5. Barra inferior: total del día y **Descargar PDF**, que se habilita cuando todas las salidas están calculadas y están el nombre y la fecha.
6. Después de descargar: link de respaldo por si el navegador bloqueó la descarga y botón "Empezar un día nuevo".

El borrador (fecha, salidas y paradas) se guarda en el navegador: si se cierra la pestaña, al volver sigue ahí. Los mapas se recalculan con un clic.

## 5. Cálculo de ruta (`Rutas.js`)

- `Maps.newDirectionFinder()`: origen y destino = oficina, waypoints = paradas como `lat,lng`, modo `DRIVING`, `optimizeWaypoints=false`, región `ar`, idioma `es`.
- km = suma de `legs[].distance.value` / 1000, redondeado a 1 decimal. Total del día = suma de los km de cada salida.
- Mapa: `Maps.newStaticMap()` de 640×400 con la polyline y los marcadores (O = oficina, 1..9 = paradas, X = parada 10). Si la polyline es demasiado larga para la URL, se dibujan rectas entre las paradas.
- Cache (`CacheService`, 6 h) de rutas, mapas y búsquedas, para no gastar cuota.
- Buscador: `Maps.newGeocoder()` con `setBounds` sobre Salta. Si el texto no dice "Salta", se agrega ", Salta, Argentina". Se filtra por `administrative_area_level_1 = Salta`.
- **Cuotas**: el servicio Maps de Apps Script tiene un límite diario de consultas según el tipo de cuenta (verificar el vigente en la documentación de cuotas de Apps Script). Cada búsqueda nueva y cada ruta nueva consume una consulta. Los resultados que salen de la cache no consumen.

## 6. PDF (`Pdf.js`)

Se genera con HTML convertido a PDF (`Utilities.newBlob(html).getAs('application/pdf')`) y se devuelve al navegador en base64 para descargarlo. Nombre: `Recorridos_{yyyy-MM-dd}_{usuario}.pdf`.

Contenido:
- Encabezado con logo (opcional, `LOGO_FILE_ID`), título y "Viáticos por km · Proyecto Norte".
- Empleado, mail, fecha del recorrido, cantidad de salidas y oficina de salida y regreso.
- **Total del día en km**, destacado.
- Por salida: motivo, tabla de tramos (Desde → Hasta → km), total de la salida, mapa y link a Google Maps.
- Pie: fecha y hora de generación y aclaración de cómo se calcularon los km.

## 7. Seguridad

- Toda función pública de la web app valida que el usuario sea del dominio (`usuarioActual_()`).
- Las funciones de editor (`validarConfig`, tests) exigen la cuenta dueña (`exigirDueno_()`).
- Todo texto del usuario se escapa antes de entrar al PDF y en la pantalla se inserta con `textContent`.
- Permisos del script: solo `userinfo.email` y `drive.readonly` (para leer el logo).

## 8. Limitaciones conocidas

- Sin registro, **un PDF no se puede verificar después**: el control queda en el gerente al validar en Humand. Si más adelante hace falta, se puede agregar un código de verificación o un registro en una planilla.
- Nada impide generar dos veces el PDF del mismo día. La duplicación se controla en Humand.
- Si se abre desde la app de Humand en el celular, la descarga puede estar bloqueada. Se pensó para la compu.

## 9. Fuera de alcance

- Montos y tarifas, períodos, cierres, mails y reemisiones.
- Integración por API con Humand.
- Peajes y estacionamiento.
