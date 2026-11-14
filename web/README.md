# Pockai Web

Web oficial de **Pockai** (*pocket* + *yokai* + *AI*), el nombre público del juego que en este repositorio se llama PetAI. Contiene dos cosas:

- **Landing pública** en español e inglés, generada como HTML estático.
- **Panel de administración oculto** para gestionar precios, eventos, usuarios y pockais. Ahora mismo es un **mock**: trabaja con datos de ejemplo guardados en el navegador y no hace ninguna petición al backend.

## Requisitos

- Node `^22.22.3` o `^24.15.0` (lo exige Angular CLI 22).
- pnpm 12 (el del monorepo).

## Comandos

Desde la raíz del monorepo:

```bash
pnpm install
pnpm web:dev      # servidor de desarrollo en http://localhost:4200 (español)
pnpm web:test     # tests unitarios (Vitest)
pnpm web:build    # build estático en web/dist/pockai-web/browser
```

Desde `web/`:

| Comando | Qué hace |
|---|---|
| `pnpm start` | Desarrollo en español. Para inglés: `pnpm ng serve --configuration en`. |
| `pnpm build` | Sincroniza sprites, compila `es` y `en`, prerenderiza la landing y ejecuta `scripts/postbuild.mjs`. |
| `pnpm preview` | Sirve el build en `http://localhost:4300` como lo haría un hosting estático. |
| `pnpm test` | Tests unitarios. |
| `pnpm extract-i18n` | Extrae los textos fuente a `src/locale/messages.es.json` (referencia para traducir). |

El servidor de desarrollo sirve un solo idioma, así que el selector ES/EN de la landing solo funciona de verdad sobre el build (`pnpm build && pnpm preview`).

## Estructura

```
web/
  scripts/
    sync-assets.mjs    copia los sprites de shared/assets/sprites a public/sprites
    postbuild.mjs      redirección de la raíz, rutas del panel, robots.txt y sitemap.xml
    preview.mjs        servidor estático para revisar el build
  src/
    styles/            tokens.css (sistema de diseño) y base.css (botones, tarjetas, diálogos…)
    locale/            messages.en.json (traducción al inglés)
    app/
      site.config.ts   dominio público y enlaces de descarga (pendientes de definir)
      shared/ui/       pegatina, cinta y marquee
      landing/         la landing: content.ts (textos y datos), plantilla y estilos
      admin/
        auth.ts        acceso simulado y guard
        shell.ts       marco del panel (navegación, restablecer datos, salir)
        data/          modelos, semillas, repositorios y registro de actividad
        ui/            ResourcePage: listado + alta/edición + borrado genérico
        features/      resumen, precios, eventos, usuarios, pockais, registro
```

`public/sprites` está en `.gitignore`: la fuente de los sprites sigue siendo `shared/assets/sprites`, y las especies de la landing se leen de `shared/game-data/species.json`.

## Sistema de diseño

Los tokens de `src/styles/tokens.css` (colores, tipografía, espaciado, radios) vienen de la referencia de estilo acordada: papel pastel, pegatinas de colores vivos, titulares enormes con el interlineado aplastado y contorno negro de 1 px. Están declarados con `@theme static` de Tailwind v4, así que sirven a la vez como utilidades (`bg-sky-wash`, `p-24`, `rounded-2xl-2`) y como variables CSS (`var(--color-sunburst)`).

Ojo con el espaciado: la escala está nombrada en píxeles, de modo que `p-24` son 24 px, no 96.

Reglas que conviene respetar al añadir pantallas:

- Botones y etiquetas con forma de píldora; tarjetas con radio de 20–40 px. Nada por debajo de 16 px.
- Contorno negro de 1 px en todo lo interactivo. Sin sombras y sin degradados.
- Las acciones son negras (relleno) o blancas con contorno. El azul es decorativo, nunca color de acción.
- El verde es un color de pegatina, no un indicador de éxito: los estados se comunican con texto.
- Los titulares display usan `class="display"` (interlineado 0.8) y van acompañados de una cinta o de pegatinas.

### Tipografías

La referencia usa **Lateral** (display) y **Aeonik Pro** (interfaz), que son comerciales y no están en el repositorio. Mientras no haya licencia se cargan sus sustitutos, auto-alojados con `@fontsource`: **Bowlby One** e **Inter**. Las pilas `--font-lateral` y `--font-aeonik-pro` ya ponen las originales en primer lugar; para activarlas basta con añadir sus `@font-face` (por ejemplo en `src/styles/base.css`) con los ficheros de la fuente.

La cinta azul y las pegatinas son SVG propios, dibujados para este proyecto.

## Idiomas

Se usa el i18n nativo de Angular (`@angular/localize`). El español es el idioma fuente y el inglés vive en `src/locale/messages.en.json`. El build genera `/es/` y `/en/`, y la raíz redirige a uno u otro según el idioma del navegador.

Para añadir o cambiar un texto de la landing:

1. Escríbelo en español con un id fijo: `i18n="@@seccion.clave"` en la plantilla, o `` $localize`:@@seccion.clave:Texto` `` en `content.ts`.
2. Añade la misma clave con su traducción en `messages.en.json`.

Si falta una traducción el build falla (`i18nMissingTranslation: "error"`), así que no puede publicarse una página a medio traducir. El panel de administración no se traduce: está solo en español.

## Panel de administración

- **Dónde está:** en `/es/admin`. No hay ningún enlace hacia él desde la landing, no aparece en `sitemap.xml`, `robots.txt` lo excluye, lleva `noindex` y su código va en chunks aparte que la landing no descarga.
- **Cómo entrar:** con el código de demo definido en `src/app/admin/auth.ts` (`DEMO_ACCESS_CODE`). La sesión dura lo que dure la pestaña.
- **Qué gestiona:**

  | Sección | Contenido | Origen de los datos de ejemplo |
  |---|---|---|
  | Resumen | Indicadores, pockais por rareza, eventos próximos y actividad reciente | Calculado a partir del resto |
  | Precios | Catálogo de la tienda; precios editables en la celda y ajuste porcentual en lote | `foods.json`, `seasons.json`; los huevos son inventados |
  | Eventos | Festividades, temporadas, torneos y raids, con estado según fechas | `festivals.json`, `seasons.json`; torneo y raid inventados |
  | Usuarios | Monedas, gemas y suspensión de cuentas | Generados (correos `@example.com`) |
  | Pockais | Especies con sus estadísticas base y mascotas de jugadores | `species.json`; mascotas generadas |
  | Registro | Historial de lo hecho en el panel | Se va llenando al usarlo |

- **Dónde se guardan los cambios:** en `localStorage` del navegador, bajo claves `pockai.admin.*`. «Restablecer datos» los borra y vuelve a los datos de partida.

### Esto no es seguridad

El acceso es **simulado**. El código de demo viaja dentro del JavaScript que se sirve al navegador y cualquiera puede leerlo; ocultar la ruta tampoco protege nada. Es aceptable únicamente porque el panel solo maneja datos de ejemplo.

Antes de conectar datos reales hace falta, como mínimo:

1. Un rol de administrador en el backend (hoy el modelo `User` no tiene ninguno) y endpoints de administración que comprueben ese rol en el servidor.
2. Sustituir `AdminAuth` por el inicio de sesión real y eliminar `DEMO_ACCESS_CODE`.
3. Valorar servir el panel desde un origen distinto al de la landing pública.

### Conectar el backend

Las pantallas no saben de dónde vienen los datos: solo usan la interfaz `Repository<T>` de `src/app/admin/data/repository.ts` (`list`, `create`, `update`, `remove`, `reset`). Cada recurso se inyecta con un token (`ITEMS`, `EVENTS`, `USERS`, `SPECIES`, `PETS`) cuya `factory` crea hoy un `MockRepository`.

Para pasar un recurso a la API real:

1. Escribe una clase que implemente `Repository<T>` con `HttpClient`.
2. Cambia la `factory` de su token para devolver esa clase.

Los modelos de `data/models.ts` usan los mismos nombres de campo que el esquema Prisma (`priceCoins`, `priceGems`, `accountXp`, `speciesId`…) para que ese cambio no obligue a tocar las pantallas. Cuando existan los endpoints, los tipos pueden salir de `shared/openapi/api-types.ts`.

Para añadir una sección nueva: crea un componente en `features/` que configure `<app-resource-page>` con sus columnas y campos, regístralo en `admin.routes.ts` y en el menú de `shell.ts`, y añade la ruta a `ADMIN_ROUTES` en `scripts/postbuild.mjs`.

## Despliegue

`pnpm build` deja en `dist/pockai-web/browser` un sitio completamente estático que se puede subir a cualquier hosting o CDN, sin servidor Node:

```
index.html        redirige a /es/ o /en/
es/  en/          landing prerenderizada en cada idioma
es/admin/…        shell del panel (se ejecuta solo en el navegador)
robots.txt  sitemap.xml
```

No hacen falta reglas de reescritura: `postbuild.mjs` crea un `index.html` por cada ruta del panel.

Antes de publicar:

- Define el dominio real. Está como marcador (`https://pockai.example`) en `src/app/site.config.ts`, y el build lo toma de la variable de entorno `SITE_URL` para `robots.txt` y `sitemap.xml`: `SITE_URL=https://tu-dominio pnpm build`. Ambos valores deben coincidir.
- Rellena los enlaces de descarga en `DOWNLOADS` (`site.config.ts`). Mientras estén a `null`, la landing muestra «Descarga próximamente».
- Falta una imagen para compartir en redes (`og:image`); los demás metadatos Open Graph ya se generan por idioma.
