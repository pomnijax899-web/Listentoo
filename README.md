# Listentoo
App de música web e instalable (PWA) con cuentas de usuario, sincronización entre dispositivos y un diseño propio: **Orbit**.

**Web:** https://pomnijax899-web.github.io/Listentoo/

## De dónde sale la música
Todo suena dentro de la app con el reproductor de audio nativo. No se usa YouTube. Así la música sigue sonando con la pantalla bloqueada y aparece en la Dynamic Island, en HyperOS y en los controles multimedia del sistema.

| Fuente | Qué aporta | Cómo suena |
|---|---|---|
| **Deezer** | Catálogo comercial completo (más de 120 M de canciones): artistas, álbumes, listas, playlists, géneros | Vista previa de 30 s |
| **Audius** | Música independiente, y versiones oficiales que suben los propios artistas | **Completa**. Si el artista de una canción del catálogo la subió él mismo a Audius, se reproduce completa en lugar de la vista previa (emparejamiento estricto: mismo artista, mismo título, duración similar, sin remixes ni covers) |
| **Radio en directo** (radio-browser.info) | Miles de emisoras con licencia de todo el mundo, filtradas para que sean de música | **Completa**, en directo 24/7 |
| **Jamendo** (opcional) | Cientos de miles de canciones con licencia Creative Commons | **Completa**. Se activa desde el panel de admin con un Client ID gratuito |
| **Tus archivos** | MP3, M4A, FLAC, WAV, OGG… guardados en el dispositivo | **Completa** y sin conexión |
| **LRCLIB** | Letras sincronizadas | — |

No existe una fuente gratuita y legal que permita escuchar a la carta, completa, cualquier canción comercial. Ofrecerlo exigiría licencias discográficas o que cada usuario conecte su suscripción (Spotify Premium, Apple Music…).

## Funciones
- **Inicio:** accesos rápidos, Top 50, emisoras en directo, álbumes, artistas, playlists, estados de ánimo y recomendaciones según los artistas que sigues.
- **Explorar:** búsqueda de canciones, artistas, álbumes, playlists, emisoras y canciones completas; géneros y estados de ánimo.
- **Radio:** emisoras cercanas según el idioma del dispositivo, las más escuchadas, 16 géneros, buscador de emisoras y emisoras guardadas.
- **Cuentas (Supabase):** registro, acceso, recuperación de contraseña, perfil y borrado de cuenta.
- **Sincronización** en tiempo real entre dispositivos, y playlists públicas por enlace.
- **Panel de admin:** estadísticas, usuarios, fuentes de audio y anuncios en directo.
- **Temas:** 10 temas, color dinámico, aurora animada y vinilo giratorio.
- **Interfaz Orbit:** isla flotante, dock, reproductor orbital con anillo de progreso, letras sincronizadas y temporizador.
- **Controles del sistema (Media Session):** Dynamic Island y pantalla de bloqueo en iPhone, notificación multimedia en HyperOS y Android, y controles de Windows y macOS. Opcionalmente, notificaciones con botones.

## Arquitectura
```
index.html / styles.css / sw.js     shell, diseño y service worker (offline)
js/main.js      router, isla, órbita, letras, notificaciones
js/views.js     páginas (inicio, explorar, radio, artista, álbum, cuenta, perfil, temas, admin…)
js/ui.js        componentes
js/player.js    motor de reproducción (audio nativo) y Media Session
js/api.js       Deezer, Audius (+ emparejamiento de versiones completas), Radio Browser, Jamendo, LRCLIB
js/cloud.js     Supabase: auth, sincronización, historial, configuración, admin
js/library.js   biblioteca local (caché de la nube)
js/themes.js    motor de temas
supabase/migrations/   esquema SQL con Row Level Security
supabase/functions/resolve-track/   retirada (antes buscaba en YouTube); responde 410
```

### Seguridad
- Todas las tablas tienen RLS: cada usuario solo accede a sus propios datos.
- El rol de admin se asigna únicamente desde el servidor.
- La clave pública de Supabase (`js/config.js`) es pública por diseño.

## Puesta en marcha (admin)
1. **Jamendo (opcional):** crea una app gratis en https://devportal.jamendo.com/ y pega su Client ID en *Tú → Panel de admin → Fuentes de audio*.
2. **Supabase → Authentication → URL Configuration:** pon el Site URL y las Redirect URLs a `https://pomnijax899-web.github.io/Listentoo/`.
3. **Registros abiertos:** el correo gratuito de Supabase solo envía unos pocos emails por hora. Configura un SMTP propio o desactiva «Confirm email».

## Ejecutar en local
Sin paso de build: `python3 -m http.server` en esta carpeta y abre `http://localhost:8000`.
