# Listentoo
App de música web e instalable (PWA) con cuentas de usuario, sincronización entre dispositivos y un diseño propio: **Orbit**.

**Web:** https://pomnijax899-web.github.io/Listentoo/

## Qué incluye
- **Catálogo completo** de Deezer (más de 120 millones de canciones): artistas, álbumes, discografías, listas, playlists, géneros y estados de ánimo.
- **Reproducción dentro de la app:**
  - Canciones comerciales completas a través del reproductor oficial de YouTube integrado, para usuarios con cuenta, una vez que el admin configura la clave.
  - Música independiente de Audius y archivos del dispositivo, siempre completos.
  - Sin cuenta, o sin clave configurada: vistas previas de 30 s.
- **Cuentas** (Supabase Auth): registro, acceso, recuperación y cambio de contraseña, perfil, borrado de cuenta.
- **Sincronización en tiempo real** de «Me gusta», playlists, álbumes, artistas seguidos, historial y ajustes entre todos los dispositivos.
- **Playlists públicas** compartibles por enlace (`#/p/<id>`).
- **Panel de admin** (solo la cuenta administradora):
  - Estadísticas y gráfica de escuchas.
  - Lista de usuarios.
  - Clave de YouTube guardada en el servidor.
  - Anuncios en directo para todos los usuarios.
- **Temas:** Aurora, Medianoche, Neón, Océano, Bosque, Atardecer, Nube, Sakura, Arena y Sistema. Opciones de color dinámico según la portada, aurora animada y vinilo giratorio. Se sincronizan con la cuenta.
- **Interfaz Orbit:**
  - La «isla», un mini reproductor flotante que se expande.
  - Dock de cristal y fondo aurora con los colores de la portada.
  - Álbumes con vinilo que asoma de la funda.
  - Reproductor orbital con anillo de progreso que se puede arrastrar y letras sincronizadas (LRCLIB).
- **Controles del sistema** mediante Media Session:
  - iPhone: Dynamic Island y pantalla de bloqueo.
  - HyperOS y Android: notificación multimedia y Super Island.
  - Escritorio: Windows y macOS.
  - Opcional: notificaciones de «sonando ahora» con botones.

## Arquitectura
```
index.html / styles.css / sw.js     shell, diseño y service worker (offline)
js/main.js      router, isla, órbita, letras, notificaciones
js/views.js     páginas (inicio, explorar, artista, álbum, cuenta, perfil, temas, admin…)
js/ui.js        componentes
js/player.js    motor de reproducción (audio + YouTube) y Media Session
js/cloud.js     Supabase: auth, sincronización, historial, admin, reproducción completa
js/library.js   biblioteca local (caché de la nube)
js/themes.js    motor de temas
js/api.js       Deezer, Audius, LRCLIB
supabase/migrations/   esquema SQL con Row Level Security
supabase/functions/resolve-track/   busca la versión completa de una canción (la clave de YouTube nunca llega al navegador)
```

### Seguridad
- Todas las tablas tienen RLS: cada usuario solo puede leer y modificar sus propios datos.
- El rol de admin vive en la tabla `admins`, que solo se puede escribir desde el servidor. Ninguna cuenta puede hacerse admin desde la app.
- La clave de YouTube está en `app_secrets`, sin ninguna política de acceso, y solo la lee la función de servidor.
- La clave pública de Supabase (`js/config.js`) es pública por diseño.

## Puesta en marcha (admin)
1. **Clave de YouTube:** entra con la cuenta admin → *Tú → Panel de admin → Reproducción completa*. Pega una clave de la *YouTube Data API v3* y pulsa «Probar con una canción».
2. **Supabase → Authentication**:
   - *URL Configuration*: pon el **Site URL** a `https://pomnijax899-web.github.io/Listentoo/` y añádela también en *Redirect URLs*. Lo necesitan los enlaces de confirmación y de recuperación de contraseña.
   - *Sign In / Providers → Email*: el correo gratuito de Supabase solo envía unos pocos emails por hora. Para registros abiertos, configura un SMTP propio (por ejemplo Resend o Brevo) o desactiva «Confirm email».

## Ejecutar en local
Sin paso de build: `python3 -m http.server` en esta carpeta y abre `http://localhost:8000`.
