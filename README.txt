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

## Vincular dispositivos (sincronización P2P)
- En la pestaña **Vincular** de la app verás tu PIN de 8 dígitos. El código completo de PeerJS es `dolce-timer-<cadena fija de 64 caracteres>-<PIN>`: la parte de 64 caracteres es idéntica en todos los dispositivos, así que lo único distinto entre móviles son los 8 dígitos del PIN. La app compone el código sola: basta con teclear el PIN del compañero (o escanear su QR). Si dos dispositivos elegían el mismo PIN a la vez, la app detecta el choque y asigna uno nuevo automáticamente.
- Ambos dispositivos deben tener la app abierta y conexión a internet (usa la red pública de señalización de PeerJS; los datos viajan cifrados de móvil a móvil).
- Se sincronizan en tiempo real: stock, cápsulas, niveles/máquina, ajustes, widget, historial y el cronómetro (se ve avanzar en todos los móviles).
- Si un dispositivo se reconecta o cambia de PIN, la app reintenta sola con los últimos compañeros conocidos.
- Nota: PeerJS y la librería QR se cargan desde unpkg.com; la primera vez hace falta internet. Después quedan cacheados por el service worker para uso offline (aunque la vinculación en sí requiere red).

## Comportamiento
- En modo instalado (`display: standalone`) no se muestra la barra de URL del navegador. Los controles Atrás e Inicio están dentro de la app.
- En PC, el diseño se adapta a una vista más ancha.
- Por defecto los datos son locales a cada navegador/dispositivo; con la función «Vincular» se sincronizan entre varios móviles vía WebRTC (PeerJS), sin cuentas ni servidor propio.
- Los tiempos incluidos son ejemplos; configura los segundos adecuados para tus bebidas.
