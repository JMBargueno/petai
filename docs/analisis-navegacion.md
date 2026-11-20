# Análisis de navegación: escritorio y app móvil

Fecha de la revisión: 20 de noviembre de 2026.

Alcance: la app de escritorio (Tauri + Svelte) y la app móvil (Android e iOS, que comparten el shell `@pockai/mobile`). La web (`web/`, Angular) queda fuera.

Ninguna de las dos apps usa enrutado por URL. La navegación es de estado: `dest`/`sub` en escritorio y `tab` más `petSection`/`progressSection`/… en móvil. Las «rutas» de este documento son esas combinaciones de destino y sección.

---

## 1. Escritorio

Una sola ventana (`desktop/src-tauri/tauri.conf.json`) con un panel flotante. El componente que lo controla es `desktop/src/components/ControlPanel.svelte`. La constante `NAV` (líneas 137–145) define los destinos y el render está en las líneas 522–662.

| Destino | Clave | Sub-secciones (clave) |
|---|---|---|
| Mascota | `pet` | Inicio (`home`), Mochila (`backpack`), Eclosión (`hatch`), Vínculo (`bonding`), Mente (`mind`), Hábitat (`habitat`), Armario (`wardrobe`), Habilidades (`skills`) |
| Jugar | `play` | Minijuegos (`games`), Arena (`arena`), Raid (`raid`), Torneo (`tournament`), Entrenamiento (`training`), Cocina (`cooking`), Aventura (`adventure`) |
| Chat | `chat` | Sin sub-secciones (renderiza `AiTab` para cualquier `sub`) |
| Social | `social` | Mi Perfil (`profile`), Amigos (`friends`), Clanes (`clans`), Visitas (`visits`) |
| Progreso | `progress` | Misiones (`missions`), Temporada (`seasons`) |
| Tienda | `shop` | Tienda (`store`), Cofres (`chests`) |
| Ajustes | `settings` | Cuenta (`account`), Avisos (`notifications`), Sonido (`sound`), Escritorio (`desktop`), Acerca de (`about`) |

### Entradas a la navegación

- **Barra superior:** los seis destinos sin Ajustes. Atajos Ctrl+1…6 (`ControlPanel.svelte`, líneas 193–206). Esc cierra el panel.
- **Engranaje de cabecera:** abre Ajustes y, al cerrarlo, vuelve al destino anterior (`toggleSettings`, `beforeSettings`).
- **Peticiones externas** (prop `request`, desde `desktop/src/App.svelte`):
  - Clic en la mascota → `pet/home`.
  - Campana → `settings/notifications`.
  - «Acerca de» → `settings/about`.
  - Archivo soltado sobre la mascota → `chat` con el prompt preparado.
- **Botones dentro de las vistas** (`go()`):
  - «Decorar casa» en `HomeView` → `pet/habitat`.
  - Onboarding → `settings/desktop`.
- **Memoria por destino:** `lastSub` recuerda la última sub-sección de cada destino.

---

## 2. App móvil

El shell es `shared/mobile/src/MobileApp.svelte`. La configuración está en `shared/mobile/src/config.ts`. Android (`apps/android/src/config.ts`) e iOS (`apps/ios/src/config.ts`) usan `mobileConfig()` sin cambios de navegación: solo difieren en la plataforma y el texto de «sin núcleo».

### Barra inferior (5 pestañas)

| Pestaña | Clave | Secciones (`DEFAULT_SECTIONS`) |
|---|---|---|
| Mascota | `pet` | Inicio (`home`), Charla (`chat`), Vínculo (`bond`), Huevos (`eggs`), Armario (`wardrobe`), Mente (`mind`), Hábitat (`habitat`) |
| Mochila | `backpack` | Sin sub-secciones (`BackpackView`) |
| Jugar | `play` | Minijuegos, Arena, Raid, Torneo, Entrenar, Cocina, Aventura |
| Tienda | `shop` | Tienda (`store`), Cofres (`chests`) |
| Progreso | `progress` | Misiones (`missions`), Temporada (`season`) |

### Fuera de la barra

- **Cuenta** (`account`): se abre tocando el nombre de la cabecera (`MobileApp.svelte`, línea ~215). Secciones: Cuenta, Perfil, Amigos, Visitas, Clanes y Ajustes (apariencia y sonido).

### Navegación por código

- `go(dest, sub)` (`MobileApp.svelte`, línea ~193) solo entiende `shop` (con `chests`) y `pet` (con `hatch`, que se traduce a `eggs`). Cualquier otro destino cae en Mascota.
- `goToTab` anima la lente de la barra durante 300 ms. La cabecera cambia `tab` directamente, sin animación.

---

## 3. Comparación escritorio y móvil

| Concepto | Escritorio | Móvil |
|---|---|---|
| Chat IA | Destino de primer nivel | Dentro de Mascota › Charla |
| Mochila | Dentro de Mascota | Pestaña propia en la barra |
| Tienda | Destino propio | Pestaña propia |
| Social | Destino de primer nivel | Dentro de Cuenta |
| Ajustes | Engranaje de cabecera | Dentro de Cuenta › Ajustes |
| Habilidades | Sí (Mascota) | No |
| Avisos, Escritorio, Acerca de | Sí (Ajustes) | No (son de escritorio) |
| Eclosión / Huevos | Eclosión (Mascota) | Huevos (Mascota) |

---

## 4. Hallazgos

1. **Dos arquitecturas distintas para la misma app.** Chat y Social son de primer nivel en escritorio y están escondidos en móvil. Puede ser una decisión de producto, pero no está documentada como tal.
2. **Móvil: Ajustes y Social solo se alcanzan desde la cabecera.** La barra no da ninguna pista visual, así que la descubribilidad es baja.
3. **`docs/PANTALLAS.md` §3.1 está desfasado.** Propone cinco pestañas (Mascota, Jugar, Chat, Progreso, Más) y la app tiene otra estructura (Mascota, Mochila, Jugar, Tienda, Progreso, más Cuenta desde la cabecera).
4. **Comentario desfasado en escritorio.** El comentario de `NAV` dice «6 destinos» y la constante tiene 7 entradas (Ajustes incluido). Es menor.
5. **Móvil: `go()` ignora los destinos no soportados.** Hoy solo se emiten `shop` y `pet`, así que no hay fallo, pero un destino nuevo caería en Mascota sin aviso.
6. **Móvil: «Ir a la tienda» desde Mochila** pone `tab = 'shop'` sin resetear `shopSection`, así que puede abrir en la sección que quedó (p. ej. Cofres). Escritorio sí fija `store`.
7. **Escritorio: `leaveSub()` solo limpia el estado de eclosión.** Si se añade estado ligado a sub-secciones, habrá que ampliarlo ahí.
8. **Escritorio: `chat` ignora `sub`.** Una petición con `sub` distinto de vacío se acepta sin efecto. No causa fallos hoy.

---

## 5. Recomendaciones

- Decidir y documentar si Chat y Social deben ser de primer nivel en móvil, o si la diferencia es intencionada.
- Dar una pista visible a Ajustes y Social en móvil (un icono en la cabecera o una pestaña «Más»).
- Actualizar `docs/PANTALLAS.md` §3.1 para reflejar la navegación real o marcar la propuesta como pendiente.
- Corregir el comentario de `NAV` (6 → 7 destinos, o aclarar que Ajustes va aparte).
- Fijar `sub: 'store'` en el «Ir a la tienda» móvil y revisar `go()` antes de añadir nuevos destinos.
