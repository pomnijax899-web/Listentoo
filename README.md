# Listentoo
App de música web e instalable (PWA) con cuentas de usuario, sincronización entre dispositivos y un diseño propio: **Orbit**.

**Web:** https://pomnijax899-web.github.io/Listentoo/

## De dónde sale la música
| Fuente | Qué aporta | Cómo suena |
|---|---|---|
| **Deezer** | Catálogo comercial completo (más de 120 M de canciones) | Vista previa de 30 s si no hay versión completa |
| **YouTube** (reproductor oficial) | Versión completa de las canciones del catálogo | **Completa**, dentro de la app. El reproductor va en un `iframe` con `sandbox` sin permisos de ventanas emergentes ni de navegación, así que **no puede abrir pestañas ni ventanas**, y no recibe toques salvo cuando el navegador exige uno para activar el sonido (iOS). Necesita una clave de la YouTube Data API v3 guardada en el servidor desde el panel de admin. Las canciones ya encontradas suenan completas para todos, también para invitados |
| **Audius** | Música independiente y subidas oficiales de los propios artistas | **Completa**. Tiene prioridad sobre YouTube cuando el artista subió la canción él mismo |
| **Radio en directo** | Miles de emisoras de música con licencia | **Completa**, en directo |
| **Jamendo** (opcional) | Canciones Creative Commons | **Completa** |
| **Subidas Ultra** | Audios y canciones subidos por cuentas Ultra, públicos (Comunidad) o privados | **Completa** (enlace firmado de 4 h) |
| **Tus archivos** | Música del dispositivo | **Completa** y sin conexión |

Con audio nativo (Audius, radio, Jamendo, archivos y vistas previas) la música sigue sonando con la pantalla bloqueada y aparece en la Dynamic Island, en HyperOS y en los controles del sistema. Con YouTube, el vídeo tiene que estar visible (lo exigen sus normas) y la mayoría de móviles lo pausan al bloquear la pantalla.

## Planes
Todos sin anuncios. El tiempo y los saltos se cuentan en una ventana de 24 h que empieza con la primera escucha.

| Plan | Escucha | Saltos | Foto de perfil | Marco del avatar | Subir canciones |
|---|---|---|---|---|---|
| **Free** | 5 h cada 24 h | 5 | No | Sin marco | No |
| **Pro** | Ilimitada | 100 | No | Oro | No |
| **Max** | Ilimitada | Ilimitados | Sí | Diamante | No |
| **Ultra** | Ilimitada | Ilimitados | Sí | Obsidiana | Sí, públicas o privadas |
| **Admin** | Todo ilimitado, con corona | | | | |

- Los usuarios piden un plan desde *Tú → Planes*. El admin aprueba o rechaza las solicitudes, o asigna un plan a cualquier cuenta, en *Panel de admin → Cuentas y planes*.
- **Lo que controla el servidor:** el plan solo lo cambia el admin (función `admin_set_plan`). El tiempo y los saltos se cuentan con `track_usage`. Las políticas de Storage limitan la foto de perfil a Max y Ultra, y las subidas a Ultra.
- **Lo que controla la app:** las vistas previas, la radio y YouTube vienen de servicios externos. La app es quien detiene la reproducción al agotarse el tiempo.
- **Invitados:** sin cuenta se aplica el plan Free, y el uso se cuenta en el propio dispositivo.

## Funciones
- **Inicio:** accesos rápidos, Top 50, emisoras en directo, álbumes, artistas, playlists, estados de ánimo y recomendaciones según los artistas que sigues.
- **Explorar:** búsqueda de canciones, artistas, álbumes, playlists, emisoras y canciones completas; géneros y estados de ánimo.
- **Radio:** emisoras cercanas según el idioma del dispositivo, las más escuchadas, 16 géneros, buscador de emisoras y emisoras guardadas.
- **Cuentas (Supabase):** registro, acceso, recuperación de contraseña, perfil y borrado de cuenta.
- **Sincronización** en tiempo real entre dispositivos, y playlists públicas por enlace.
- **Panel de admin:** estadísticas, cuentas y planes (asignar plan y aprobar solicitudes), fuentes de audio y anuncios en directo.
- **Temas:** 10 temas, color dinámico, aurora animada y vinilo giratorio.
- **Diseño Nebula:**
  - Fondo 3D en WebGL (nebulosa con estrellas y rejilla holográfica) que toma el color de la portada y late al ritmo.
  - Carrusel 3D de álbumes que se arrastra para girar, y tarjetas con relieve 3D y reflejo.
  - Transiciones animadas entre pantallas.
  - Reproductor orbital 3D con lunas en órbita y anillo de progreso arrastrable.
  - Isla flotante y dock con borde de neón.
  - Páginas que se abren en círculo desde el punto donde tocas, foco de luz que sigue al cursor, ondas en los botones y partículas al dar «Me gusta».
  - Iconos vectoriales propios en toda la app, sin emojis.
- **Optimización:**
  - Supabase se carga en segundo plano, así la primera pantalla aparece antes.
  - El fondo se calcula a baja resolución y a 30 fps, y se pausa al cambiar de pestaña o mientras hay un vídeo.
  - Un regulador baja la calidad o apaga los efectos si el equipo no mantiene ~45 fps.
  - Las secciones fuera de pantalla no se pintan (`content-visibility`).
  - Sin desenfoques a pantalla completa.
  - Solo se animan `transform` y `opacity`: el ecualizador, el brillo de la isla y el borde del dock ya no repintan en cada fotograma.
  - El relieve 3D solo se activa con ratón, mientras lo mueves por encima.
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
supabase/functions/resolve-track/   busca la versión oficial completa en YouTube (clave solo en el servidor, caché compartida)
js/plans.js     planes, cuota de 24 h (tiempo y saltos)
js/fx.js        nebulosa WebGL, relieve 3D, carrusel 3D, apariciones y regulador de rendimiento
```

### Seguridad
- Todas las tablas tienen RLS: cada usuario solo accede a sus propios datos.
- El rol de admin se asigna únicamente desde el servidor.
- La clave pública de Supabase (`js/config.js`) es pública por diseño.

## Puesta en marcha (admin)
1. **Canciones completas (YouTube):** en *Tú → Panel de admin → Canciones completas*, pega una clave de la YouTube Data API v3 y pulsa «Probar con una canción».
2. **Jamendo (opcional):** crea una app gratis en https://devportal.jamendo.com/ y pega su Client ID en *Tú → Panel de admin → Fuentes de audio*.
3. **Supabase → Authentication → URL Configuration:** pon el Site URL y las Redirect URLs a `https://pomnijax899-web.github.io/Listentoo/`.
4. **Registros abiertos:** el correo gratuito de Supabase solo envía unos pocos emails por hora. Configura un SMTP propio o desactiva «Confirm email».

## Ejecutar en local
Sin paso de build: `python3 -m http.server` en esta carpeta y abre `http://localhost:8000`.
