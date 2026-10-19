# Dolce Timer PWA

Aplicación web progresiva (PWA) para móviles y escritorio. Los cafés se guardan en `localStorage` en el dispositivo/navegador de cada persona; no se envían a un servidor.

## Publicarla gratis con GitHub Pages
1. Crea un repositorio público llamado `dolce-timer`.
2. Sube **todos** los archivos y carpetas de este paquete, conservando la estructura: `index.html`, `manifest.webmanifest`, `sw.js` e `icons/`.
3. En el repositorio entra en **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y guarda.
5. Espera a que GitHub Pages publique la URL, por ejemplo `https://TU-USUARIO.github.io/dolce-timer/`.
6. Abre esa URL en Chrome Android. Menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**.

## Instalación
- Android/Chrome: usa la opción Instalar aplicación si aparece.
- PC/Chrome o Edge: usa el icono de instalación de la barra de direcciones o menú → Instalar página como aplicación.
- iPhone/iPad: Safari → Compartir → Añadir a pantalla de inicio.

## Comportamiento
- En modo instalado (`display: standalone`) no se muestra la barra de URL del navegador. Los controles Atrás e Inicio están dentro de la app.
- En PC, el diseño se adapta a una vista más ancha.
- Los datos son locales al navegador/dispositivo. Si alguien abre la app en su propio móvil, tendrá su propia lista. No hay sincronización entre dispositivos ni cuentas.
- Los tiempos incluidos son ejemplos; configura los segundos adecuados para tus bebidas.
