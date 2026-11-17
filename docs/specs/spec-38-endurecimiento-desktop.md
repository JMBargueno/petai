# Spec: Endurecimiento de Pockai Desktop (binario, CSP, permisos, red y actualizaciones)

## ID
38 — Endurecimiento de la app de escritorio (Tauri 2)

## Resumen
Complementa a la spec 37 (lógica de negocio en Rust). Tiene dos partes:

- **Prioridad 1 — aplicada.** Configuración de bajo riesgo: un perfil de release endurecido, una CSP
  restrictiva, el permiso `http` acotado a loopback y la garantía de que no hay DevTools en
  producción. Cada punto tiene tests o comprobaciones de CI para que no se relaje sin querer.
- **Prioridad 2 — propuesta.** Patrón de aislamiento IPC, comunicación con la API (tokens y
  *pinning*) e integridad de la app y de la clave del updater. Requiere decisiones del propietario;
  aquí van el enfoque y los pasos.

## Prioridad 1 — aplicado

### 1. Perfil de release endurecido (`desktop/src-tauri/Cargo.toml`)
```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```
| Opción | Efecto | Coste |
|---|---|---|
| `opt-level = "z"` | Optimiza por tamaño. El código queda reordenado e *inlineado*, menos parecido al fuente. | Algo más lento que `3` en cálculo intensivo; en esta app no se nota (casi todo es IO y UI). |
| `lto = true` | Optimiza todo el programa junto, incluidas las dependencias. Mezcla funciones de distintos crates y quita código muerto. | La build de release tarda más. |
| `codegen-units = 1` | Una sola unidad de compilación: más optimización entre funciones. | Más tiempo de compilación (sin paralelismo en esa fase). |
| `panic = "abort"` | Sin tablas de *unwinding*: binario más pequeño y sin metadatos de los panics. | Un panic en **cualquier** hilo cierra la app entera (antes solo moría ese hilo). |
| `strip = true` | Quita símbolos y nombres de funciones. Es lo que más dificulta leer el binario. | Los volcados de un crash no tendrán nombres. Si algún día se usa un servicio de crashes, hay que guardar los símbolos aparte antes de quitarlos. |

**`panic = "abort"` y el updater.** `tauri-plugin-updater` no depende del *unwinding*: descarga,
comprueba la firma minisign y lanza el instalador, y sus errores son `Result`, no panics. Al
actualizar, `process:allow-restart` reinicia la app con normalidad. Los únicos panics conocidos son:
- **Un endpoint del updater sin esquema.** Hacía caer la app al arrancar; ya lo evita la validación
  de `release.yml`.
- **Los `lock().unwrap()` de `main.rs`.** Con `abort` ya no hay *mutex poisoning*: si un hilo hiciera
  panic, la app se cerraría en lugar de quedar a medias.

Comprobado: `pnpm tauri build --no-bundle` compila y enlaza con este perfil (ver «Verificación»).

### 2. Content-Security-Policy (`desktop/src-tauri/tauri.conf.json`)
Antes era `"csp": null`, sin ninguna política. Ahora hay dos:
- **`csp`**: producción, servida con los assets embebidos.
- **`devCsp`**: `pnpm tauri dev`, que añade el servidor de Vite y el backend local.

Tauri añade automáticamente los *hashes*/*nonces* de sus propios scripts de arranque a `script-src`.

| Directiva (producción) | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Base para todo lo que no tenga directiva propia (workers, manifest…): solo recursos embebidos en la app. |
| `script-src` | `'self'` | Solo los bundles de Vite. Ni scripts en línea, ni `eval`, ni CDNs. Es la defensa principal contra XSS: aunque se inyectara HTML, no ejecutaría código. |
| `style-src` | `'self' 'unsafe-inline'` | Svelte usa atributos `style="…"` (barras de progreso, posiciones, sprites) y los SVG de las mascotas (`{@html}`) traen estilos internos. Sin `'unsafe-inline'` la UI se rompe. El riesgo de CSS en línea es bajo comparado con el de los scripts. |
| `img-src` | `'self' data: blob: https://game-api.pockai.world` | Imágenes y sprites empaquetados; `data:` para la exportación PNG de la constelación (`exportPng.ts`, SVG → `data:`); `blob:` para assets descargados y cacheados; la API sirve assets como respaldo del CDN (`/v1/assets/:key`). |
| `font-src` | `'self' data:` | Inter y Bowlby One van empaquetadas (`@fontsource`); Vite puede incrustar fuentes pequeñas como `data:`. Nada de Google Fonts. |
| `connect-src` | `'self' ipc: http://ipc.localhost https://game-api.pockai.world wss://game-api.pockai.world` | `ipc:` y `http://ipc.localhost` son el canal `invoke` de Tauri (macOS/Linux y Windows). La API: `fetch` REST con HTTPS y Socket.IO, que empieza con *polling* HTTPS y sube a WebSocket (`wss:`). Cualquier otro destino queda bloqueado: si un script inyectado intentara mandar el token a otro sitio, no podría. |
| `media-src` | `'self'` | No hay audio ni vídeo remotos. |
| `object-src` | `'none'` | Sin `<object>`/`<embed>` (plugins). |
| `frame-src` | `'none'` | La app no incrusta iframes. |
| `base-uri` | `'self'` | Impide que un `<base href>` inyectado redirija las rutas relativas. |
| `form-action` | `'none'` | Ningún formulario hace *submit* nativo (todo va por `fetch`). |

**Qué no necesita CSP**: el updater, las notificaciones, `shell.open` y el plugin `http` (Hermes
local) hacen sus peticiones desde Rust, no desde el webview.

**`dangerousDisableAssetCspModification: ["style-src"]`.** Tauri añade un *nonce* a `style-src`, y
cuando hay un nonce los navegadores **ignoran** `'unsafe-inline'`. Eso rompería los `style="…"` de
Svelte. Con esta opción Tauri no toca `style-src` (sí sigue protegiendo `script-src`). Es la
configuración que la documentación de Tauri indica para frameworks con estilos en línea.

**Origen de la API fijado.** La CSP lleva `https://game-api.pockai.world`. La API real sale de la
variable `PETAI_API_URL` en `release.yml`, que ahora **falla** si ese origen no está en `connect-src`:
así no se publica nunca una app que no pueda hablar con su backend. Si cambia el dominio, hay que
actualizar `csp` (`connect-src` e `img-src`) en `tauri.conf.json`.

**Builds de release locales.** `pnpm tauri build` sin `VITE_API_URL` apunta a
`http://127.0.0.1:3000`, que la CSP de producción bloquea. Para probar un instalador local hay que
compilar con `VITE_API_URL=https://game-api.pockai.world`, o usar `pnpm tauri dev` (que aplica `devCsp`).

**zod 4.** Al cargar, zod comprueba si puede usar `new Function` para acelerar la validación. Con
la CSP no puede: cae a su modo normal, sin errores. Es posible ver un aviso de CSP en la consola de
desarrollo; no es un fallo.

### 3. Permiso `http` (`desktop/src-tauri/capabilities/default.json`)
Antes, `http:default` permitía `https://*/**`, es decir, **cualquier web HTTPS**, desde JS y saltándose
CORS y la CSP (el plugin hace la petición desde Rust).

Al revisar el código, el plugin solo lo usa **`lib/hermesLocal.ts`** (modo «Hermes local», el LLM del
propio equipo), que ya valida con `isLoopbackUrl` que la URL sea loopback. La API de Pockai **no**
usa el plugin: va por el `fetch` del webview, que regula la CSP de arriba.

Por eso el ámbito queda en **solo loopback** (`127.0.0.1`, `localhost`, `[::1]`, http y https, con
cualquier puerto). **No** se ha añadido `https://game-api.pockai.world/**`:
- añadirlo daría a JS una segunda vía hacia la API, que se saltaría CORS y no la necesita nada;
- loopback no puede limitarse a desarrollo, porque Hermes local es una función del producto que el
  usuario activa en producción.

Si en el futuro se migran las llamadas a la API al plugin (por ejemplo, para el *pinning* del punto 7),
se añade entonces esa única entrada.

`shell:allow-open` mantiene el ámbito por defecto de Tauri (solo `http(s)://`, `mailto:` y `tel:`).
Además, `clientTools.isSafeToOpen` bloquea direcciones locales e internas.

### 4. DevTools fuera de producción
- En Tauri 2 las DevTools solo existen en builds de debug, **salvo** que se active la feature
  `devtools` del crate `tauri`. Hoy no está activa (`cargo tree -e features -i tauri` no la muestra) y
  el código no llama a `open_devtools()`.
- Nuevo paso en CI (`ci.yml` › job de escritorio): falla si alguna dependencia activa
  `tauri feature "devtools"`.
- Test en Rust: ninguna ventana de `tauri.conf.json` puede tener `"devtools": true`.

### Guardas que impiden relajar esto sin querer
| Dónde | Qué comprueba |
|---|---|
| `main.rs` › `tests::endurecimiento::la_csp_de_produccion_es_restrictiva` | CSP definida, sin `'unsafe-eval'`, sin comodines de origen, `script-src 'self'`, `object-src 'none'`. |
| `main.rs` › `tests::endurecimiento::ninguna_ventana_activa_devtools` | Ninguna ventana con `devtools: true`. |
| `main.rs` › `tests::endurecimiento::el_plugin_http_solo_llega_a_loopback` | El ámbito del plugin `http` es solo loopback. |
| `ci.yml` › «Test Tauri (Rust)» | Ejecuta `cargo test` (antes el CI solo hacía `cargo check`). |
| `ci.yml` › «Devtools disabled in release» | La feature `devtools` de `tauri` no está activa. |
| `release.yml` | El origen de `PETAI_API_URL` está en `connect-src`. |

### Verificación (2026-11-17)
- `cargo test --locked` (debug): 4 tests en verde, incluido el existente de atajos. `tauri-build`
  acepta la nueva configuración y la capability.
- `VITE_API_URL=https://game-api.pockai.world pnpm tauri build --no-bundle`: compila con el perfil
  endurecido en 1 min 39 s; `petai-desktop.exe` ocupa 10,1 MB. Lanzado en Windows, sigue vivo a los
  10 s: no hay panic al arrancar con `panic = "abort"` ni al inicializar el updater.
- El `dist` compilado se sirvió con la CSP de producción como cabecera en Chromium (el motor de
  WebView2): la pantalla de inicio de sesión se pinta con fuentes, estilos y SVG, sin violaciones de CSP
  en la consola.
- **Pendiente de comprobar a mano**:
  - en la app instalada, el flujo con sesión iniciada (sprites, Socket.IO, exportar PNG);
  - una actualización real de una versión a otra con el instalador firmado;
  - macOS (allí el IPC usa `ipc:`, ya incluido).

## Prioridad 2 — propuesta (decide el propietario)

### 6. Patrón de aislamiento (Isolation pattern)
**Qué es.** Tauri inyecta un iframe aislado (con su propio origen y su propia CSP) entre el frontend
y el núcleo. **Cada** mensaje IPC pasa por un script tuyo (`isolation/index.js`) que puede validarlo
o rechazarlo. Después Tauri lo cifra con AES-GCM, con una clave que se genera en cada arranque. Así,
aunque una dependencia npm comprometida o un XSS ejecutara JS en la página principal, no podría
llamar a comandos con argumentos que tu script no permita.

**Cuándo compensa.** Cuantos más comandos Rust propios haya, más. Con la spec 37 (Pomodoro, barks,
contexto…) su valor crece. El coste es poco: un iframe y un cifrado por mensaje, imperceptibles en
llamadas cada pocos segundos.

**Pasos.**
1. Crear `desktop/isolation/index.html` (mínimo, sin dependencias) y `desktop/isolation/index.js`:
   ```js
   window.__TAURI_ISOLATION_HOOK__ = (payload) => {
     // payload = { cmd, ... } — lista blanca de comandos y validación de argumentos
     const ALLOWED = new Set(['set_hit_regions', 'get_active_window_info', 'set_summon_shortcut',
       /* plugins: */ 'plugin:notification|notify', 'plugin:updater|check', /* … */]);
     if (!ALLOWED.has(payload.cmd)) return null; // null = se descarta
     return payload;
   };
   ```
2. En `tauri.conf.json`:
   `"app": { "security": { "pattern": { "use": "isolation", "options": { "dir": "../isolation" } } } }`.
3. Inventariar los comandos que usa el frontend, incluidos los de los plugins (sus nombres tienen la
   forma `plugin:<nombre>|<comando>`). Probar todas las funciones: un comando que falte en la lista
   blanca falla **sin error visible**.
4. Añadir un test que compare la lista blanca con los comandos de `generate_handler!` y los permisos de
   `capabilities/default.json`.

**Decisión pendiente.** Si se hace ya o junto a la fase 1 de la spec 37 (recomendado: junto a la
fase 1, cuando la lista de comandos cambie igualmente).

### 7. Comunicación con la API: tokens cortos y *certificate pinning*
**Situación actual (revisada en el código).**
- No hay claves de API embebidas. El cliente solo lleva `VITE_API_URL`.
- El backend ya emite **access tokens JWT de 15 min** y **refresh tokens de 7 días**
  (`JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`). `api.ts` renueva el access token ante un 401.
- **Punto débil:** los dos tokens se guardan en `localStorage` (`petai_access_token`,
  `petai_refresh_token`). Cualquier JS que se ejecute en el webview los puede leer. La CSP reduce
  mucho ese riesgo, pero el refresh token de 7 días es el dato más valioso de la app.

**Enfoque recomendado (por orden de impacto/coste).**
1. **Refresh token en el llavero del sistema, no en JS.**
   - Comandos Rust `auth_store_refresh`, `auth_refresh` y `auth_logout`, con el crate `keyring`
     (Windows Credential Manager / macOS Keychain / Secret Service).
   - La petición `/v1/auth/refresh` la hace Rust (con `reqwest` o el cliente del plugin) y devuelve a
     JS **solo** el access token de 15 min. Ese token puede vivir en memoria, sin `localStorage`.
   - Un XSS ya no podría robar una sesión de 7 días, solo usar la actual mientras dure.
2. **Rotación del refresh token en el backend.** Cada `/auth/refresh` emite un refresh nuevo e
   invalida el anterior. Si se reutiliza uno antiguo, se revoca toda la familia (detección de robo).
   Hay que comprobar si el backend ya lo hace; si no, es un cambio solo de servidor.
3. **Vincular el token al dispositivo** (opcional). Al iniciar sesión, Rust genera un par de claves
   Ed25519 guardado en el llavero y envía la pública. Cada refresh va firmado con la privada (DPoP
   simplificado). Un refresh token robado no sirve en otra máquina.
4. ***Certificate pinning*** (ver abajo).

***Pinning*: enfoque y advertencias.**
- El webview (WebView2/WKWebView) **no permite** fijar certificados desde la app. Para hacer
  *pinning*, las llamadas a la API tienen que pasar por Rust: el plugin `http` o comandos propios
  con `reqwest` + `rustls` y un `ServerCertVerifier` que compare el hash SPKI.
- **Fijar la clave pública (SPKI), no el certificado.** Let's Encrypt renueva cada 60–90 días; si se
  reutiliza la clave al renovar, el pin sigue valiendo.
- **Siempre al menos dos pines**: la clave actual y una de respaldo generada y guardada *offline*. Sin
  respaldo, una rotación de emergencia deja a todos los clientes sin conexión hasta que actualicen,
  y el updater también va contra la API.
- **Caducidad del pin.** Por ejemplo, si el binario tiene más de N meses, se desactiva el pin y se
  avisa. Evita bloquear para siempre instalaciones antiguas.
- **Coste.** Socket.IO también tendría que pasar por Rust, y todo `api.ts` usaría un `fetch` de
  Rust. Es un cambio grande.
- **Recomendación.** Hacer primero los puntos 1–2, que cubren el riesgo real (robo de sesión).
  Dejar el *pinning* solo para el flujo de autenticación (login + refresh), que ya pasaría por Rust en
  el punto 1, en lugar de para toda la API.

### 8. Integridad de la app y clave privada del updater
**Lo que ya hay.**
- Las actualizaciones van firmadas con minisign. La clave pública está en `tauri.conf.json`, y el
  updater rechaza cualquier paquete sin una firma válida.
- La clave privada está en los secretos de GitHub (`TAURI_SIGNING_PRIVATE_KEY` + contraseña).
- `.gitignore` excluye `*.key` y `.env*`.

**Verificar la integridad al arrancar: qué tiene sentido.**
- **Firma de código del sistema operativo (lo importante).**
  - Windows: firmar el `.exe` y el instalador con Authenticode (certificado OV/EV, o Azure Trusted
    Signing, que es lo más barato hoy). Tauri lo soporta con `bundle.windows.certificateThumbprint` /
    `signCommand`.
  - macOS: Developer ID + notarización (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`… en `tauri-action`).
  - Es el sistema operativo quien verifica la integridad (SmartScreen, Gatekeeper), y un binario
    modificado pierde la firma.
- **Autocomprobación dentro de la app** (calcular el hash del propio ejecutable al arrancar). Solo
  detecta modificaciones torpes: quien puede parchear el binario puede parchear también la
  comprobación. Si se quiere, como señal y no como bloqueo:
  - Rust calcula el SHA-256 del ejecutable y lo envía al login;
  - el backend lo compara con los hashes publicados de cada versión y lo usa como **señal de
    riesgo** (marcar la sesión, limitar acciones de economía), nunca para cerrar la app;
  - encaja con la regla de la spec 37: la validación de verdad está en el servidor.
- **Assets.** Ya están embebidos en el binario y se sirven por el protocolo de Tauri. Con el binario
  firmado, cubiertos.

**Proteger la clave privada del updater (nunca en el repo).**
1. Guardar la clave original **offline**: gestor de contraseñas con copia cifrada y una copia en papel
   o USB en un lugar seguro. Si se pierde, las instalaciones existentes **no** pueden volver a
   actualizarse.
2. En GitHub, mover los secretos de *repository* a un **Environment** `release` con *required
   reviewers*. Así, ni un PR ni un workflow modificado pueden leerlos sin tu aprobación, y el job de
   `release.yml` declara `environment: release`.
3. Fijar las actions de terceros por SHA (ya se hace con `tauri-action` y `rust-toolchain`) y revisar
   las que no lo estén.
4. Contraseña larga y aleatoria en `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, guardada aparte de la clave.
5. Plan de rotación, porque minisign no tiene revocación:
   - publicar una versión que añada la **nueva** clave pública (Tauri admite una sola, así que esa
     versión se firma con la clave antigua y lleva ya la nueva);
   - a partir de ahí, firmar con la nueva.
   - Si la clave se filtra, el atacante podría firmar actualizaciones, pero aún necesitaría controlar
     el endpoint `game-api.pockai.world/v1/desktop/updates`. Aquí el *pinning* del updater y la
     seguridad del backend son la segunda barrera.
6. Opcional: escaneo de secretos en CI (`gitleaks`) para que nunca entre una clave en un commit.

## Decisiones pendientes (propietario)
| Pregunta | Recomendación |
|---|---|
| Patrón de aislamiento | Sí, junto a la fase 1 de la spec 37. |
| Refresh token en el llavero (Rust + `keyring`) | Sí, primero. |
| Rotación del refresh token en el backend | Comprobar si existe; si no, añadirla. |
| *Certificate pinning* | Solo en login/refresh, con dos pines SPKI y caducidad. |
| Firma de código (Authenticode / notarización) | Sí, antes de distribuir de forma amplia. |
| Hash del ejecutable como señal de riesgo en el servidor | Opcional, después de la firma de código. |
| Environment `release` con revisores para los secretos | Sí, coste cero. |

## Registro de cambios
- 2026-11-17 — Prioridad 1 aplicada:
  - perfil de release, CSP, `devCsp`, permiso `http` solo a loopback;
  - tests de endurecimiento en `main.rs`;
  - CI con `cargo test` y la guarda de devtools;
  - `release.yml` comprueba que la API está en la CSP.

  Prioridad 2, documentada.
