# Listentoo
App web instalable (PWA) para escuchar música en cualquier dispositivo, con una interfaz premium inspirada en los grandes servicios de streaming.

## Catálogo y reproducción
| Fuente | Qué aporta | Reproducción |
|---|---|---|
| **Deezer** | Más de 120 millones de canciones: artistas, álbumes, discografías, listas, playlists, géneros, artistas relacionados, radios | Vista previa de 30 s |
| **YouTube** (opcional) | Versión completa de cualquier canción del catálogo | Completa, en el reproductor oficial de YouTube integrado |
| **Audius** | Música independiente | Completa |
| **Tus archivos** | MP3, M4A, FLAC, WAV, OGG… guardados en el dispositivo | Completa y sin conexión |
| **LRCLIB** | Letras sincronizadas | — |

Para escuchar todo completo, abre **Ajustes** (⚙) y pega una clave gratuita de la *YouTube Data API v3* (Google Cloud Console → activar la API → Credenciales → Clave de API). La clave se guarda solo en tu dispositivo. Cada búsqueda en YouTube consume cuota (unas 100 canciones nuevas al día con la cuota gratuita); las canciones ya resueltas se recuerdan.

## Funciones
- Inicio con accesos rápidos, Top 50, álbumes, artistas y playlists del momento, recomendaciones según los artistas que sigues y música independiente.
- Búsqueda en vivo con resultado principal y filtros (canciones, artistas, álbumes, playlists, independiente); exploración por géneros.
- Páginas de artista (populares, discografía filtrable, relacionados, radio), álbum y playlist con colores dinámicos tomados de la portada.
- Biblioteca: Tus me gusta, playlists propias (crear, editar, reordenar arrastrando, recomendaciones para añadir), álbumes y playlists guardados, artistas seguidos, archivos locales.
- Reproductor: aleatorio, repetir todo/una, cola con «reproducir a continuación», reproducción automática de canciones similares, temporizador, letras sincronizadas, panel «Reproduciendo», reproductor a pantalla completa, controles del sistema y atajos de teclado.
- Exportar/importar la biblioteca para llevarla a otro dispositivo.
- Instalable en escritorio, Android e iOS; funciona sin conexión con tus archivos locales.

## Ejecutar
Sin paso de build: sirve la carpeta con cualquier servidor estático (`python3 -m http.server`) y abre `http://localhost:8000`. Para instalarla en otros dispositivos debe publicarse por HTTPS (GitHub Pages, Netlify…).

## Estructura
```
index.html        shell de la app
styles.css        diseño
sw.js             service worker (offline)
js/main.js        router, reproductor, letras, ajustes
js/views.js       páginas
js/ui.js          componentes
js/player.js      motor de reproducción y cola
js/api.js         Deezer, Audius, LRCLIB, YouTube
js/library.js     biblioteca del usuario
js/util.js        utilidades
```
