# Setup

No hace falta planilla ni carpeta de Drive: el script es independiente.

## 1. Cuenta dueña
Usar una cuenta del dominio que no dependa de una persona (por ejemplo `comunidad@proyectonorte.com.ar`).
Todo lo que sigue se hace con esa cuenta.

## 2. clasp (en la compu donde corre Claude Code)
```bash
npm install -g @google/clasp
clasp login                       # con la cuenta dueña
# Activar la Apps Script API: https://script.google.com/home/usersettings
clasp create --type standalone --title "Viáticos km - Proyecto Norte" --rootDir src
clasp push
```
`clasp create` genera `.clasp.json` (está en `.gitignore`). Si el proyecto ya existe, copiar `.clasp.json.example` a `.clasp.json` y poner el `scriptId`.

## 3. Logo (opcional)
1. Subir el logo (PNG o JPG, idealmente de menos de 200 KB) al Drive de la cuenta dueña.
2. Copiar el ID del archivo (la parte de la URL entre `/d/` y `/view`).
3. En Apps Script: Configuración del proyecto → Propiedades del script → `LOGO_FILE_ID` = ese ID.

## 4. Pruebas
1. `clasp open` y, en el editor, correr `validarConfig()`. La primera vez pide permisos: aceptarlos.
2. Correr `correrTests()` y revisar el registro de ejecución.

## 5. Deploy de la web app
Implementar → Nueva implementación → Aplicación web:
- Ejecutar como: **Yo**
- Quién tiene acceso: **Cualquier usuario de proyectonorte.com.ar**

Guardar el **Deployment ID** para las actualizaciones (`clasp deploy -i <ID> -d "descripción"`), así la URL no cambia.

## 6. Humand
Agregar la URL de la web app (`https://script.google.com/a/macros/proyectonorte.com.ar/s/.../exec`) como link en el
Portal de Servicios, para que se abra en una pestaña nueva.
