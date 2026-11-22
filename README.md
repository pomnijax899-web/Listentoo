# Listentoo
App web instalable (PWA) para escuchar música en cualquier dispositivo.

## Funciones
- Inicio con tendencias, géneros y «escuchado recientemente»; búsqueda en vivo.
- Reproductor completo: play/pausa, siguiente/anterior, aleatorio, repetir (todo/una), barra de progreso, volumen, cola, reproductor a pantalla completa.
- Tus me gusta, playlists propias (crear, renombrar, eliminar, añadir/quitar), menú contextual por canción.
- Importar música del dispositivo (IndexedDB, funciona sin conexión).
- Controles multimedia del sistema (pantalla de bloqueo, teclas multimedia) y atajos de teclado (espacio, ←/→, Shift+←/→, ↑/↓, m, s, r, /).
- Instalable y con caché offline del shell (service worker + manifest).

## Fuentes de música
Audius (canciones completas), iTunes Search (previews de 30 s) y tus archivos locales. No incluye el catálogo de Spotify.

## Ejecutar
Sin build: sirve la carpeta con cualquier servidor estático (`python3 -m http.server`) y abre `http://localhost:8000`. Para instalarla debe servirse por HTTPS (p. ej. GitHub Pages o Netlify) o localhost.
