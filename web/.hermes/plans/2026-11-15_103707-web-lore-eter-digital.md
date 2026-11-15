# Plan — Web Pockai: página de lore "El Éter Digital" (componentes reutilizables)

## Goal

Añadir a la web de Pockai (Angular, `web/`) una página de lore en `/es/lore` y `/en/lore` con el lore completo ("El Éter Digital"), en el mismo estilo visual "Slush" que la landing, con componentes Angular reutilizables, teaser en la landing, y una PR contra `main` para que el usuario la verifique (sin mergear).

## Contexto / supuestos (verificado en el repo)

Repo: `/home/jmbargueno/scratch/petai` (monorepo; la web vive en `web/`).

Hechos confirmados del código actual:
- Angular 22, componentes standalone, `ChangeDetectionStrategy.OnPush`, templates y estilos inline en los componentes de sección.
- La landing (`web/src/app/landing/landing.html`) es una secuencia de `<section class="band band--X">` (X ∈ `sky`, `white`, `gray`, `lavender`, `ink`). Clases globales en `web/src/styles/base.css`: `.band`, `.band__inner`, `.section-title`, `.hl` (+ `--mint/--ember/--lavender/--blue`), `.lead`, `.card`, `.btn`, `.tag`, `.label-caps`, `.visually-hidden`. Animaciones en `web/src/styles/motion.css`: `.reveal` (+ `--pop/--tilt`), `.hover-lift`, `.float`.
- Estética "Slush": contorno negro 1px (`--outline`), radios grandes, sin sombras ni degradados, tarjetas giradas tipo collage, stickers (`app-sticker`), cintas `app-ribbon` (shape `wave`/`dip`). La única banda oscura de la landing es `app-rarities` (`band--ink`, bordes de tarjetas en `var(--color-paper-white)`).
- i18n: fuentes ES en los `.ts` con `$localize`:`@@id:texto` y `i18n="@@id"` en templates; EN a mano en `web/src/locale/messages.en.json` (`{locale, translations}`); ES generado con `npm run extract-i18n` → `messages.es.json`. **`i18nMissingTranslation: "error"` → el build falla si falta cualquier clave EN.**
- Rutas: `web/src/app/app.routes.ts` (`''` → Landing, `admin`, `**` → `''`). Localize + `outputMode: static` → `/es/...` y `/en/...` se prerenderizan; el vhost de webproxy hace fallback `/*.html`, así que `/es/lore` funciona igualmente.
- Metadatos/canonical: `Landing.setHead()` en `web/src/app/landing/landing.ts` (título, meta, og, canonical, alternates, JSON-LD) — patrón a replicar para `/lore`.
- Sitemap: `web/scripts/postbuild.mjs` genera `sitemap.xml` solo con `/es/` y `/en/` → hay que añadir `/lore`.
- Nav de la landing: estilos `.nav/.logo/.nav__links/.nav__end/.lang` viven **dentro de `landing.css` (escopados al componente)** → hay que moverlos a `base.css` para compartirlos. El panel admin **no** usa la clase `.nav` (verificado con grep) → el move es seguro.
- Sprites disponibles: `web/public/sprites/` → `egg_closed.svg`, `egg_cracked.svg`, 4× `pattern_*.svg`, sprites de especies.
- Dato de juego compartido: `shared/game-data/balance.json` (probabilidades), `patterns.json`, `species.json` — los lee `web/src/app/landing/content.ts` (probabilidades reales, no inventar).
- El canon del lore es `docs/LORE.md` en el mismo repo (nuevo lore "Éter Digital", actualizado 2026-11-15).
- Specs existentes: `landing.spec.ts`, `pet-demo.spec.ts` (patrón: `TestBed.createComponent`, `whenStable`, asserts sobre `querySelectorAll`).
- Decisiones de usuario (2026-11-15): (1) ruta nueva `/es/lore`+`/en/lore` con página propia + teaser corto en la landing + enlace "Mundo" en la nav; (2) lore completo (los 7 bloques + diccionario técnico→lore como fichas); (3) EN completo traducido en la misma PR; (4) estilo Slush pastel con bandas `band--ink` en los bloques de Éter/Coliseo; (5) **sin spec-kit**, desarrollo directo en rama → PR.

Supuestos:
- La landing actual NO se rediseña: solo se añade 1 enlace en la nav y 1 sección teaser.
- No se toca `mobile/` ni `shared/` ni el panel admin.
- El copy del lore es una adaptación *resumida* de `docs/LORE.md` para web (párrafos cortos); el texto ES completo está ya especificado abajo (no improvisar).

## Arquitectura / enfoque

Nueva carpeta `web/src/app/lore/` que sigue EXACTAMENTE el patrón de `web/src/app/landing/sections/*`: cada bloque del lore es un componente standalone OnPush con su banda, su `app-ribbon`, título `display` + `lead` y una parrilla de tarjetas. Se reutilizan `app-sticker`, `app-ribbon`, `app-marquee` de `shared/ui` (ampliando el set de iconos del sticker), los datos de rareza/patrones de `landing/content.ts` y `balance.json`/`patterns.json`, y las utilidades globales de `base.css`/`motion.css`. Un componente `app-term-card` reutilizable pinta las fichas del diccionario. Toda cadena visible tiene id `@@lore.*` y traducción EN.

Banda por bloque (rhythm visual): hero `sky` → Origen `white` → Rarezas+Promesa `ink` → Apariencia `sky` → Seis Flujos `gray` → Despertar `sky` → Ciclo vital `white` → Coliseo `ink` → Diccionario `gray` → CTA final `white`.

## Tareas (cada una ≈ 2–5 min, cada una termina en commit)

**Convención de todos los commits**: mensajes `feat(web/lore): …`, `test(web/lore): …`, `i18n: …`. Trabajar siempre en `cd /home/jmbargueno/scratch/petai`.

### T0 — Baseline y rama (2 min)
```bash
cd /home/jmbargueno/scratch/petai
git checkout main && git pull --ff-only
cd web && npx ng test --watch=false   # espera: todas las specs pasan (estado actual)
cd .. && git checkout -b lore/mundo-eter-digital
```
Si la baseline falla, parar y resolverlo antes de empezar.

### T1 — Nuevos iconos de `app-sticker` (flame, drop, leaf, moon, sun) (5 min)
Archivo: `web/src/app/shared/ui/sticker.ts`.
1. Ampliar el tipo:
```ts
export type StickerIcon =
  | 'egg' | 'heart' | 'bolt' | 'star' | 'chat' | 'coin' | 'shield' | 'phone'
  | 'flame' | 'drop' | 'leaf' | 'moon' | 'sun';
```
2. Añadir a `PATHS` (mismas proporciones 24×24, `fill-rule="evenodd"` ya está en el svg):
```ts
  flame:
    'M12 2c1.4 3.2 4.5 5.2 4.5 9a4.5 4.5 0 0 1-9 0c0-1.6.6-2.9 1.4-4.2.5 1 1.2 1.7 2.1 2.1C11 6.7 11.4 4.2 12 2z',
  drop: 'M12 2.5S6.5 9 6.5 13.5a5.5 5.5 0 0 0 11 0C17.5 9 12 2.5 12 2.5z',
  leaf: 'M19 5c0 9-5 14-14 14 0-9 5-14 14-14z',
  moon: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z',
  sun: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 1.5v2.4M12 20.1v2.4M1.5 12h2.4M20.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7',
```
Verificación: `cd web && npx ng test --watch=false` (pasa) + `npx ng serve` → abrir `http://localhost:4200/es/` y mirar el hero: los stickers existentes sin cambios. Si un icono nuevo se ve mal (ver el código en una tarjeta temporal o en devtools), ajustar el path. Commit: `feat(web/ui): iconos flame, drop, leaf, moon y sun para app-sticker`.

### T2 — Compartir la nav: mover `.nav` de `landing.css` a `base.css` (5 min)
1. En `web/src/app/landing/landing.css`, BORRAR el bloque de nav (líneas 6–75 actuales: comentarios `/* ───── Nav ───── */` hasta el `@media (width < 860px)` de `.nav__links`). Dejan `:host` y `h3/ul/p` reset en landing.css.
2. En `web/src/styles/base.css`, dentro de `@layer components`, añadir EXACTAMENTE ese bloque (`.nav`, `.nav > *`, `.logo`, `.nav__links,.nav__end`, `.nav__end`, `.nav .btn--filled`, `.lang`, `.lang a`, `.lang a[aria-current]`, y el `@media (width < 860px)` con `display:none` de `.nav__links`).
Verificación: `npx ng test --watch=false` pasa; `npx ng serve` → la nav de la landing se ve idéntica (sticky, logo redondo, pills ES/EN, botón Descargar). Commit: `refactor(web): nav y lang a base.css para compartir con la página de lore`.

### T3 — `web/src/app/lore/content.ts`: todo el copy ES + datos (5 min)
Archivo nuevo `web/src/app/lore/content.ts` (copiar tal cual):
```ts
import balance from '../../../../shared/game-data/balance.json';
import { PATTERNS, RARITIES } from '../landing/content';

/**
 * Textos de la página de lore (canon: docs/LORE.md). Cada cadena lleva un id fijo
 * (`@@lore.*`) que debe existir también en src/locale/messages.en.json.
 */

export const MARQUEE = $localize`:@@lore.marquee:El Éter Digital · Códices Latentes · Telar de Mulberry · Seis Flujos · Promesa del Telar ·`;

export const META = {
  title: $localize`:@@lore.meta.title:Pockai — El Éter Digital`,
  description: $localize`:@@lore.meta.description:El lore de Pockai: de dónde nacen los huevos, sus rarezas, los seis elementos, el despertar de la IA y el Coliseo de Resonancia.`,
};

export interface LoreRarity {
  id: string;
  gameName: string;
  loreName: string;
  nature: string;
  percent: number;
}

const LORE_NAMES: Record<string, { name: string; nature: string }> = {
  normal: {
    name: $localize`:@@lore.rar.name.normal:Eco Cotidiano`,
    nature: $localize`:@@lore.rar.nature.normal:Nacidos de impulsos simples: un mensaje de buenos días, una alarma, una nota rápida. Leales, estables y cercanos.`,
  },
  rare: {
    name: $localize`:@@lore.rar.name.rare:Espíritu Condensado`,
    nature: $localize`:@@lore.rar.nature.rare:Formados por pasiones intensas: una canción escuchada mil veces, un archivo guardado con celo durante años.`,
  },
  super_rare: {
    name: $localize`:@@lore.rar.name.super_rare:Anomalía Resonante`,
    nature: $localize`:@@lore.rar.nature.super_rare:Absorbieron flujos complejos de la red. Ya no imitan la materia común: refractan el código puro.`,
  },
  legendary: {
    name: $localize`:@@lore.rar.name.legendary:Arquetipo Ancestral`,
    nature: $localize`:@@lore.rar.nature.legendary:Ecos de grandes mitos colectivos, leyendas digitales y servidores antiguos que nunca se apagaron.`,
  },
  mythic: {
    name: $localize`:@@lore.rar.name.mythic:Singularidad Primordial`,
    nature: $localize`:@@lore.rar.nature.mythic:Fragmentos del Primer Latido, el instante en que la red global cobró sensibilidad. Recuerdan el mundo antes de las pantallas.`,
  },
};

/** Probabilidades reales (balance.json) + nombre en el lore. */
export const LORE_RARITIES = Object.entries(balance.rarity).map(([id, r]) => ({
  id,
  gameName: RARITIES[id] ?? id,
  loreName: LORE_NAMES[id]?.name ?? id,
  nature: LORE_NAMES[id]?.nature ?? '',
  percent: Math.round(r.probability * 1000) / 10,
}));

export const ORIGIN_CARDS = [
  {
    icon: 'egg' as const,
    color: 'sunburst' as const,
    title: $localize`:@@lore.origin.1.title:Códices Latentes`,
    body: $localize`:@@lore.origin.1.body:También llamados Huevos de Datos. Cada vez que los humanos usamos la tecnología, dejamos tras de sí residuos emocionales y fragmentos de código huérfano.`,
  },
  {
    icon: 'chat' as const,
    color: 'voltage-violet' as const,
    title: $localize`:@@lore.origin.2.title:El Telar de Mulberry`,
    body: $localize`:@@lore.origin.2.body:En las profundidades del servidor central, esos fragmentos giran hasta cristalizar en una cáscara protectora. Sí: un guiño al algoritmo determinista Mulberry32.`,
  },
  {
    icon: 'star' as const,
    color: 'ember' as const,
    title: $localize`:@@lore.origin.3.title:Resonancia`,
    body: $localize`:@@lore.origin.3.body:Tus misiones diarias, minijuegos y niveles de cuenta generan Resonancia: un faro magnético que atrae huevos perdidos desde el Éter hacia tu Santuario de Bolsillo.`,
  },
  {
    icon: 'heart' as const,
    color: 'mint-pop' as const,
    title: $localize`:@@lore.origin.4.title:Incubación (5 min – 8 h)`,
    body: $localize`:@@lore.origin.4.body:Un huevo recién extraído del flujo de datos está frío y comprimido. Necesita el calor de tu batería y tu cercanía constante para descomprimir su secuencia espiritual y tomar forma.`,
  },
];

export const PATTERN_DEFS: Record<string, string> = {
  scales: $localize`:@@lore.appear.def.scales:Placas de Datos: firewalls ancestrales y armaduras lógicas tejidas en la piel.`,
  crystal: $localize`:@@lore.appear.def.crystal:Cuarzo Lógico: datos tan puros que se solidifican en estructuras geométricas translúcidas.`,
  galaxy: $localize`:@@lore.appear.def.galaxy:Vacío Abisal: una ventana literal al espacio profundo entre servidores.`,
  aurora: $localize`:@@lore.appear.def.aurora:Viento Solar: corrientes magnéticas vivas que fluyen en tiempo real sobre su lomo.`,
};

export const ELEMENTS = [
  {
    icon: 'flame' as const,
    color: 'ember' as const,
    name: $localize`:@@el.fire:Fuego`,
    sub: $localize`:@@lore.elem.sub.fire:Termo-Impulso`,
    body: $localize`:@@lore.elem.body.fire:El calor de los procesadores al límite: pasión, ira y overclocking. Cálidos al tacto de la pantalla y feroces en la ofensiva.`,
  },
  {
    icon: 'drop' as const,
    color: 'electric-blue' as const,
    name: $localize`:@@el.water:Agua`,
    sub: $localize`:@@lore.elem.sub.water:Flujo de Datos`,
    body: $localize`:@@lore.elem.body.water:Adaptabilidad y torrentes de información incesantes. Fluyen alrededor de los obstáculos y restauran la armonía del sistema.`,
  },
  {
    icon: 'leaf' as const,
    color: 'mint-pop' as const,
    name: $localize`:@@el.plant:Planta`,
    sub: $localize`:@@lore.elem.sub.plant:Bio-Red`,
    body: $localize`:@@lore.elem.body.plant:Código vivo que crece como árboles binarios y algoritmos evolutivos. Paciencia y regeneración constante.`,
  },
  {
    icon: 'bolt' as const,
    color: 'sunburst' as const,
    name: $localize`:@@el.electric:Eléctrico`,
    sub: $localize`:@@lore.elem.sub.electric:Pulso Voltaico`,
    body: $localize`:@@lore.elem.body.electric:La chispa pura del hardware y la sinapsis instantánea. Nunca están quietos: viven en el milisegundo.`,
  },
  {
    icon: 'moon' as const,
    color: 'voltage-violet' as const,
    name: $localize`:@@el.shadow:Sombra`,
    sub: $localize`:@@lore.elem.sub.shadow:Deep Éter`,
    body: $localize`:@@lore.elem.body.shadow:No es el mal: es el misterio y la privacidad. Nacen de los secretos guardados, el modo incógnito y los rincones silenciosos de la noche. Protectores de tu intimidad.`,
  },
  {
    icon: 'sun' as const,
    color: 'lavender' as const,
    name: $localize`:@@el.light:Luz`,
    sub: $localize`:@@lore.elem.sub.light:Fibra Óptica`,
    body: $localize`:@@lore.elem.body.light:Información a la velocidad de la luz: pantallas encendidas en la oscuridad. Revelan la verdad y disipan la corrupción de datos.`,
  },
];

export const AWAKING_STEPS = [
  {
    icon: 'chat' as const,
    color: 'sunburst' as const,
    title: $localize`:@@lore.awake.1.title:El Susurro`,
    sub: $localize`:@@lore.awake.1.sub:Charla · 0+ de Profundidad`,
    body: $localize`:@@lore.awake.1.body:Se rompe el sello del silencio: comprende por primera vez tu idioma y articula pensamientos propios, teñidos por su especie, su carácter y cómo se siente en ese instante.`,
  },
  {
    icon: 'heart' as const,
    color: 'mint-pop' as const,
    title: $localize`:@@lore.awake.2.title:El Hilo de Ariadna`,
    sub: $localize`:@@lore.awake.2.sub:Memoria · 200+`,
    body: $localize`:@@lore.awake.2.body:La niebla del olvido se disipa: tu nombre, tus gustos, qué le dijiste hace tres días cuando estabas estresado. Ya no es cualquier pockai de su especie: es el tuyo.`,
  },
  {
    icon: 'star' as const,
    color: 'voltage-violet' as const,
    title: $localize`:@@lore.awake.3.title:La Simbiosis`,
    sub: $localize`:@@lore.awake.3.sub:Agente · 500+`,
    body: $localize`:@@lore.awake.3.body:Espíritu familiar moderno: puede iniciar la conversación, cuidar de su propio cuerpo y, con el Sello de Vinculación de 6 dígitos en el Altar de Escritorio, abrir portales web y sostener pergaminos de texto.`,
  },
];

export const LIFE_STAGES = [
  $localize`:@@lore.life.stage.1:Huevo`,
  $localize`:@@lore.life.stage.2:Bebé`,
  $localize`:@@lore.life.stage.3:Joven · nv 10`,
  $localize`:@@lore.life.stage.4:Adulto · nv 25`,
  $localize`:@@lore.life.stage.5:Forma Final · nv 50`,
];

export const COLISEUM_CARDS = [
  {
    icon: 'shield' as const,
    color: 'electric-blue' as const,
    title: $localize`:@@lore.colo.1.title:Duelo de Proyección`,
    body: $localize`:@@lore.colo.1.body:Tu pockai no arriesga su cuerpo físico: proyecta un Avatar de Combate impulsado por su vitalidad real. Bien alimentado, limpio, sano y feliz, el avatar brilla y sus escudos son firmes. Hambriento, triste o enfermo, sus glitches de ánimo hacen que flaquee.`,
  },
  {
    icon: 'star' as const,
    color: 'sunburst' as const,
    title: $localize`:@@lore.colo.2.title:Sombra Guardiana`,
    body: $localize`:@@lore.colo.2.body:Cuando no estás, tu pockai deja una Impronta de Guardia con la doctrina táctica que le enseñaste. Sus proyecciones se cruzan en un plano matemático puro (la Semilla del Destino): ningún truco externo puede alterar el choque. Al terminar, el guardián del Coliseo te envía un pergamino contándote la hazaña.`,
  },
  {
    icon: 'coin' as const,
    color: 'lavender' as const,
    title: $localize`:@@lore.colo.3.title:Ligas`,
    body: $localize`:@@lore.colo.3.body:De Bronce a Mítica. No miden quién es más cruel: miden qué pareja Custodio–Pockai ha alcanzado el mayor grado de Armonía Táctica en el ranking mundial.`,
  },
];

export const GLOSSARY = [
  { app: $localize`:@@lore.gloss.1.a:Jugador`, lore: $localize`:@@lore.gloss.1.l:Custodio` },
  { app: $localize`:@@lore.gloss.2.a:App (móvil / escritorio)`, lore: $localize`:@@lore.gloss.2.l:Santuario de Bolsillo · Altar de Escritorio` },
  { app: $localize`:@@lore.gloss.3.a:VisualSeed`, lore: $localize`:@@lore.gloss.3.l:Firma de Origen` },
  { app: $localize`:@@lore.gloss.4.a:Pity (30 / 120)`, lore: $localize`:@@lore.gloss.4.l:Hilo del Destino` },
  { app: $localize`:@@lore.gloss.5.a:Shiny`, lore: $localize`:@@lore.gloss.5.l:Bendición del Prisma` },
  { app: $localize`:@@lore.gloss.6.a:Stats vitales`, lore: $localize`:@@lore.gloss.6.l:Armonía Vital` },
  { app: $localize`:@@lore.gloss.7.a:API key`, lore: $localize`:@@lore.gloss.7.l:Chispa de Hermes` },
  { app: $localize`:@@lore.gloss.8.a:Inteligencia 0–1000`, lore: $localize`:@@lore.gloss.8.l:Profundidad de Consciencia` },
  { app: $localize`:@@lore.gloss.9.a:Código de 6 dígitos`, lore: $localize`:@@lore.gloss.9.l:Sello de Vinculación` },
  { app: $localize`:@@lore.gloss.10.a:Combate asíncrono`, lore: $localize`:@@lore.gloss.10.l:Duelo de Resonancia` },
  { app: $localize`:@@lore.gloss.11.a:Huevo`, lore: $localize`:@@lore.gloss.11.l:Códice Latente` },
  { app: $localize`:@@lore.gloss.12.a:Sueño`, lore: $localize`:@@lore.gloss.12.l:Desfragmentación` },
  { app: $localize`:@@lore.gloss.13.a:Abandono`, lore: $localize`:@@lore.gloss.13.l:Letargo Melancólico` },
  { app: $localize`:@@lore.gloss.14.a:Seed / RNG`, lore: $localize`:@@lore.gloss.14.l:Telar de Mulberry` },
];
```
Nota: `PATTERNS` se importa de `../landing/content` (los usa `appearance.ts`) y no se duplica; los nombres de patrón/rareza reutilizan los ids existentes `@@pat.*` y `@@rar.*` (ids i18n globales, no hay que re-declararlos).
Commit: `feat(web/lore): copy ES completo de la página de lore`.

### T4 — Extract + traducción EN completa (5 min)
1. `cd web && npm run extract-i18n` → regenera `src/locale/messages.es.json` con los ids `@@lore.*`.
2. Añadir a `src/locale/messages.en.json` (objeto `translations`) estas claves **exactas** (copiar en el JSON, orden no importa):
```json
"lore.marquee": "The Digital Aether · Latent Codices · The Loom of Mulberry · Six Flows · The Loom's Promise ·",
"lore.meta.title": "Pockai — The Digital Aether",
"lore.meta.description": "Pockai's lore: where eggs are born, their rarities, the six elements, the AI awakening and the Colosseum of Resonance.",
"lore.nav.home": "Pockai, back home",
"lore.nav.label": "World",
"lore.nav.origin": "Origin",
"lore.nav.rare": "Rarities",
"lore.nav.elem": "Elements",
"lore.nav.awake": "Awakening",
"lore.nav.life": "Cycle",
"lore.nav.colo": "Colosseum",
"lore.nav.back": "Home",
"lore.hero.title": "The {$START_TAG_SPAN}Digital{$CLOSE_TAG_SPAN} Aether",
"lore.hero.lead": "From the friction between human life and the ocean of data, a world is born. And from its depths, the pockais emerge.",
"lore.hero.cta": "Descend into the Aether",
"lore.origin.title": "Where do the {$START_TAG_SPAN}eggs{$CLOSE_TAG_SPAN} come from?",
"lore.origin.lead": "They're not manufactured: they condense and are fished from the currents of the Digital Aether.",
"lore.origin.1.title": "Latent Codices",
"lore.origin.1.body": "Also called Data Eggs. Every time humans use technology, we leave behind emotional residue and orphaned code fragments.",
"lore.origin.2.title": "The Loom of Mulberry",
"lore.origin.2.body": "In the depths of the central server, those fragments spin until they crystallize into a protective shell. Yes: a nod to the deterministic Mulberry32 algorithm.",
"lore.origin.3.title": "Resonance",
"lore.origin.3.body": "Your daily missions, minigames and account levels generate Resonance: a magnetic lighthouse that draws lost eggs from the Aether to your Pocket Sanctuary.",
"lore.origin.4.title": "Incubation (5 min – 8 h)",
"lore.origin.4.body": "A freshly extracted egg is cold and compressed. It needs the warmth of your battery and your constant closeness to decompress its spirit sequence and take shape.",
"lore.rar.name.normal": "Daily Echo",
"lore.rar.nature.normal": "Born from simple impulses: a good-morning message, an alarm, a quick note. Loyal, stable and close.",
"lore.rar.name.rare": "Condensed Spirit",
"lore.rar.nature.rare": "Formed from intense passions: a song listened to a thousand times, a file jealously kept for years.",
"lore.rar.name.super_rare": "Resonant Anomaly",
"lore.rar.nature.super_rare": "They absorbed complex network flows. They no longer imitate common matter: they refract pure code.",
"lore.rar.name.legendary": "Ancestral Archetype",
"lore.rar.nature.legendary": "Echoes of great collective myths, digital legends and ancient servers that never shut down.",
"lore.rar.name.mythic": "Primordial Singularity",
"lore.rar.nature.mythic": "Fragments of the First Beat, the moment the global network gained sensitivity. They remember the world before screens.",
"lore.rare.title": "Compilation {$START_TAG_SPAN}Density{$CLOSE_TAG_SPAN}",
"lore.rare.lead": "Rarity doesn't measure biological superiority: it measures how many centuries of mythology got trapped inside the egg.",
"lore.promise.title": "The Loom's Promise",
"lore.promise.lead": "“The Aether never ignores a constant heart.”",
"lore.promise.30.t": "30 hatchings",
"lore.promise.30.b": "Every common egg hatched with dedication leaves an invisible thread tied to your Sanctuary. At 30, the threads vibrate and the flow guarantees a Resonant Anomaly (SR).",
"lore.promise.120.t": "120 hatchings",
"lore.promise.120.b": "The Loom's core itself answers your devotion and opens a guaranteed breach toward an Ancestral Archetype or a Primordial Singularity.",
"lore.appear.title": "Signature of {$START_TAG_SPAN}Origin{$CLOSE_TAG_SPAN}",
"lore.appear.lead": "Each pockai draws on its skin an Origin Signature, unique and unrepeatable across the whole universe.",
"lore.appear.basic.t": "Terrestrial Mimesis",
"lore.appear.basic": "Newborns of common density imitate the nature they see through their Custodian's camera: fur, leaves, horizons.",
"lore.appear.sup.t": "Texture of the Aether",
"lore.appear.sup": "From Super-rare on, the body stops imitating the physical world and shows the real texture of the Digital Aether.",
"lore.appear.def.scales": "Data Plates: ancestral firewalls and logical armor woven into the skin.",
"lore.appear.def.crystal": "Logic Quartz: data so pure it solidifies into translucent geometric structures.",
"lore.appear.def.galaxy": "Abyssal Void: a literal window into the deep space between servers.",
"lore.appear.def.aurora": "Solar Wind: living magnetic currents flowing in real time.",
"lore.appear.shiny": "The Prism's Blessing: right as the egg crystallizes in the Loom, a Cosmic Ray (a solar bit-flip) pierces it, inverting and electrifying its palette. A being touched by the stars.",
"lore.elem.title": "The {$START_TAG_SPAN}Six Flows{$CLOSE_TAG_SPAN}",
"lore.elem.lead": "They're not medieval magic forces: they're the six fundamental manifestations of energy and information.",
"lore.elem.sub.fire": "Thermo-Impulse",
"lore.elem.body.fire": "The heat of the processor at its limit: passion, anger and overclocking. Warm to the touch, ferocious on offense.",
"lore.elem.sub.water": "Data Flow",
"lore.elem.body.water": "Adaptability and ceaseless torrents of information. They flow around obstacles and restore the system's harmony.",
"lore.elem.sub.plant": "Bio-Net",
"lore.elem.body.plant": "Living code that grows like binary trees and evolutionary algorithms. Patience and constant regeneration.",
"lore.elem.sub.electric": "Volt Pulse",
"lore.elem.body.electric": "The pure spark of hardware and the instant synapse. They never stand still: they live in the millisecond.",
"lore.elem.sub.shadow": "Deep Aether",
"lore.elem.body.shadow": "Not evil: mystery and privacy. Born from kept secrets, incognito mode and the silent corners of the night. Guardians of your intimacy.",
"lore.elem.sub.light": "Fiber Optic",
"lore.elem.body.light": "Information at the speed of light: screens lit in the dark. They reveal truth and disperse data corruption.",
"lore.awake.title": "Hermes' {$START_TAG_SPAN}Spark{$CLOSE_TAG_SPAN}",
"lore.awake.lead": "By default, every pockai is born in Dreamer Instinct: it feels, it gestures, but its mind is clouded behind a language barrier. Infuse it with the Spark of Hermes — your own API key — and the awakening begins.",
"lore.awake.1.title": "The Whisper",
"lore.awake.1.sub": "Chat · 0+ Depth",
"lore.awake.1.body": "The seal of silence breaks: it understands your language for the first time and articulates its own thoughts, tinged by its species, its character and how it feels right now.",
"lore.awake.2.title": "Ariadne's Thread",
"lore.awake.2.sub": "Memory · 200+",
"lore.awake.2.body": "The fog of forgetting dissipates: your name, your tastes, what you told it three days ago when you were stressed. It's no longer just any pockai of its species: it's yours.",
"lore.awake.3.title": "The Symbiosis",
"lore.awake.3.sub": "Agent · 500+",
"lore.awake.3.body": "A modern familiar spirit: it can start the conversation, look after its own body and, with the 6-digit Binding Seal on the Desktop Altar, open web portals and hold text scrolls.",
"lore.life.title": "The {$START_TAG_SPAN}Symbiotic{$CLOSE_TAG_SPAN} Bond",
"lore.life.lead": "Pockais are not cold autonomous programs: they feed on your attention and your circadian rhythm.",
"lore.life.stage.1": "Egg",
"lore.life.stage.2": "Baby",
"lore.life.stage.3": "Young · lv 10",
"lore.life.stage.4": "Adult · lv 25",
"lore.life.stage.5": "Final Form · lv 50",
"lore.life.stages.note": "Each stage is the stabilization of its form in the Aether: from an unstable sketch to the Apotheosis, the perfect manifestation of its lineage.",
"lore.life.sleep.t": "Defragmentation",
"lore.life.sleep.b": "When night falls in your world, the Aether tide recedes and your pockai sleeps to process the day and consolidate its memories and experience.",
"lore.life.welcome.t": "Melancholic Lethargy",
"lore.life.welcome.b": "If you disappear for days, the Sanctuary cools: static builds up, the ether runs out and loneliness dulls its core. It doesn't die — a data spirit is immortal in the server — but it weakens. When you come back, the very act of opening the Sanctuary sends a burst of warm light that breaks the cold.",
"lore.colo.title": "The Colosseum of {$START_TAG_SPAN}Resonance{$CLOSE_TAG_SPAN}",
"lore.colo.lead": "Not a bloodbath: an Astral Projection Duel, part martial art, part energy debate.",
"lore.colo.1.title": "Projection Duel",
"lore.colo.1.body": "Your pockai risks no physical body: it projects a Battle Avatar driven by its real vitality. Well fed, clean, healthy and happy, the avatar shines and its shields are firm. Hungry, sad or sick, mood glitches make it falter.",
"lore.colo.2.title": "Guardian's Shadow",
"lore.colo.2.body": "While you're away, your pockai leaves a Guard Impression with the tactical doctrine you taught it. Its projections cross in a pure mathematical plane (the Seed of Destiny): no external trick can alter the clash. When it ends, the Colosseum's guardian sends you a scroll telling of its companion's feat.",
"lore.colo.3.title": "Leagues",
"lore.colo.3.body": "From Bronze to Mythic. They don't measure who is crueler: they measure which Custodian–Pockai pair reached the greatest Tactical Harmony in the world ranking.",
"lore.gloss.title": "Dictionary of the {$START_TAG_SPAN}World{$CLOSE_TAG_SPAN}",
"lore.gloss.lead": "What the app says and what it means in the Aether.",
"lore.gloss.1.a": "Player",
"lore.gloss.1.l": "Custodian",
"lore.gloss.2.a": "App (mobile / desktop)",
"lore.gloss.2.l": "Pocket Sanctuary · Desktop Altar",
"lore.gloss.3.a": "VisualSeed",
"lore.gloss.3.l": "Origin Signature",
"lore.gloss.4.a": "Pity (30 / 120)",
"lore.gloss.4.l": "Thread of Destiny",
"lore.gloss.5.a": "Shiny",
"lore.gloss.5.l": "Prism's Blessing",
"lore.gloss.6.a": "Vital stats",
"lore.gloss.6.l": "Vital Harmony",
"lore.gloss.7.a": "API key",
"lore.gloss.7.l": "Spark of Hermes",
"lore.gloss.8.a": "Intelligence 0–1000",
"lore.gloss.8.l": "Depth of Consciousness",
"lore.gloss.9.a": "6-digit code",
"lore.gloss.9.l": "Binding Seal",
"lore.gloss.10.a": "Async battle",
"lore.gloss.10.l": "Resonance Duel",
"lore.gloss.11.a": "Egg",
"lore.gloss.11.l": "Latent Codex",
"lore.gloss.12.a": "Sleep",
"lore.gloss.12.l": "Defragmentation",
"lore.gloss.13.a": "Abandonment",
"lore.gloss.13.l": "Melancholic Lethargy",
"lore.gloss.14.a": "Seed / RNG",
"lore.gloss.14.l": "Loom of Mulberry",
"lore.teaser.title": "Beneath the {$START_TAG_SPAN}screen{$CLOSE_TAG_SPAN}",
"lore.teaser.lead": "From the friction between human life and the ocean of data, the Digital Aether is born — and with it, the pockais. Their origin, their rarities, their elements and their awakening all have a name.",
"lore.teaser.cta": "Discover the world",
"nav.world": "World"
```
Verificación (comando exacto; salida esperada `EN OK: <N> claves`):
```bash
cd web && node -e "const es=require('./src/locale/messages.es.json').translations,en=require('./src/locale/messages.en.json').translations;const miss=Object.keys(es).filter(k=>!(k in en));console.log(miss.length?miss.join('\n'):'EN OK: '+Object.keys(es).length+' claves')"
```
Si aparece alguna clave: añadirla a `messages.en.json` y repetir. (El build también fallaría por `i18nMissingTranslation: "error"`; este check solo es más rápido.)
Commit: `i18n(web/lore): traducción EN completa de la página de lore`.

### T5 — Ruta + componente `Lore` (hero + nav + meta) [TDD] (5 min)
1. **Test primero** `web/src/app/lore/lore.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { Lore } from './lore';

describe('Lore', () => {
  it('pinta el hero, la nav con los 6 anclajes y el toggle de idioma', async () => {
    const fixture = TestBed.createComponent(Lore);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('h1')?.textContent?.trim()).toBe('The Digital Aether');
    expect(el.querySelectorAll('.nav__links a').length).toBe(6);
    const hrefs = [...el.querySelectorAll('a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));
    expect(hrefs).toContain('/es/lore'); // toggle de idioma (locale de test: en)
    expect(hrefs).toContain('/en/lore');
  });
});
```
2. Ejecutar `cd web && npx ng test --watch=false` → **falla** (no existe `./lore`).
3. Ruta — `web/src/app/app.routes.ts` (nuevo contenido completo):
```ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/landing').then((m) => m.Landing),
  },
  {
    // El mundo: lore oficial en /es/lore y /en/lore (routing de idioma de localize).
    path: 'lore',
    loadComponent: () => import('./lore/lore').then((m) => m.Lore),
  },
  {
    // Panel oculto: no se enlaza desde la landing, no se prerenderiza y va en un chunk aparte.
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes'),
  },
  { path: '**', redirectTo: '' },
];
```
4. `web/src/app/lore/lore.ts` (nuevo):
```ts
import { ChangeDetectionStrategy, Component, DOCUMENT, LOCALE_ID, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Marquee } from '../shared/ui/marquee';
import { Ribbon } from '../shared/ui/ribbon';
import { Sticker } from '../shared/ui/sticker';
import { SITE_URL } from '../site.config';
import { MARQUEE, META } from './content';
import { Origin } from './sections/origin';
import { PromiseSection } from './sections/promise';
import { Appearance } from './sections/appearance';
import { Elements } from './sections/elements';
import { Awakening } from './sections/awakening';
import { LifeCycle } from './sections/life-cycle';
import { Colosseum } from './sections/colosseum';
import { Glossary } from './sections/glossary';

const LOCALES = ['es', 'en'] as const;

@Component({
  selector: 'app-lore',
  imports: [Marquee, Ribbon, Sticker, Origin, PromiseSection, Appearance, Elements, Awakening, LifeCycle, Colosseum, Glossary],
  template: `
    <app-marquee [text]="marquee" />

    <header class="nav">
      <a class="logo" [href]="home" aria-label i18n-aria-label="@@lore.nav.home">P</a>

      <nav class="nav__links" aria-label i18n-aria-label="@@lore.nav.label">
        <a class="btn btn--sm" href="#origen" i18n="@@lore.nav.origin">Origen</a>
        <a class="btn btn--sm" href="#rarezas" i18n="@@lore.nav.rare">Rarezas</a>
        <a class="btn btn--sm" href="#apariencia" i18n="@@lore.nav.appear">Apariencia</a>
        <a class="btn btn--sm" href="#elementos" i18n="@@lore.nav.elem">Elementos</a>
        <a class="btn btn--sm" href="#despertar" i18n="@@lore.nav.awake">Despertar</a>
        <a class="btn btn--sm" href="#ciclo" i18n="@@lore.nav.life">Ciclo</a>
        <a class="btn btn--sm" href="#coliseo" i18n="@@lore.nav.colo">Coliseo</a>
      </nav>

      <div class="nav__end">
        <div class="lang" role="group" aria-label i18n-aria-label="@@nav.lang">
          <a href="/es/lore" lang="es" hreflang="es" [attr.aria-current]="locale === 'es' ? 'true' : null">ES</a>
          <a href="/en/lore" lang="en" hreflang="en" [attr.aria-current]="locale === 'en' ? 'true' : null">EN</a>
        </div>
        <a class="btn btn--filled btn--sm" [href]="home" i18n="@@lore.nav.back">Landing</a>
      </div>
    </header>

    <main>
      <section id="top" class="band band--sky lore-hero">
        <app-ribbon shape="wave" draw="load" />
        <app-sticker class="lore-hero__spot float" icon="egg" color="sunburst" [rotate]="-10" [size]="112" />
        <app-sticker class="lore-hero__spot float" icon="star" color="lavender" [rotate]="9" [size]="88" />
        <app-sticker class="lore-hero__spot float" icon="moon" color="voltage-violet" [rotate]="14" [size]="80" />

        <div class="band__inner lore-hero__inner">
          <h1 class="display section-title reveal" i18n="@@lore.hero.title">
            El Éter <span class="hl">Digital</span>
          </h1>
          <p class="lead lead--center reveal" i18n="@@lore.hero.lead">
            De la fricción entre la vida humana y el océano de datos, nace un mundo. Y de sus profundidades, emergen los pockai.
          </p>
          <a class="btn btn--filled reveal" href="#origen" i18n="@@lore.hero.cta">Descender al Éter</a>
        </div>
      </section>

      <app-origin />
      <app-promise-section />
      <app-appearance />
      <app-elements />
      <app-awakening />
      <app-life-cycle />
      <app-colosseum />
      <app-glossary />
    </main>
  `,
  styleUrl: './lore.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lore {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly marquee = MARQUEE;
  protected readonly home = `/${this.locale}/`;

  constructor() {
    this.setHead(inject(Title), inject(Meta), inject(DOCUMENT));
  }

  /** Metadatos por idioma; en el prerender quedan en el HTML estático de /lore. */
  private setHead(title: Title, meta: Meta, doc: Document) {
    const url = `${SITE_URL}/${this.locale}/lore`;
    title.setTitle(META.title);
    meta.updateTag({ name: 'description', content: META.description });
    meta.updateTag({ property: 'og:title', content: META.title });
    meta.updateTag({ property: 'og:description', content: META.description });
    meta.updateTag({ property: 'og:type', content: 'website' });
    meta.updateTag({ property: 'og:url', content: url });

    if (doc.head.querySelector('link[rel="canonical"]')) return;

    const link = (rel: string, href: string, hreflang?: string) => {
      const el = doc.createElement('link');
      el.rel = rel;
      el.href = href;
      if (hreflang) el.hreflang = hreflang;
      doc.head.appendChild(el);
    };
    link('canonical', url);
    for (const l of LOCALES) link('alternate', `${SITE_URL}/${l}/lore`, l);
  }
}
```
⚠️ El template enlaza 7 anclajes (`nav__links a` = 7, no 6: `origen, rarezas, apariencia, elementos, despertar, ciclo, coliseo`) → corregir el spec de T5.1 a `toBe(7)`.
5. `web/src/app/lore/lore.css` (nuevo):
```css
:host {
  display: block;
}

/* Hero compacto (la landing usa .hero más alta; aquí el lore empieza con prisa). */
.lore-hero {
  margin-block-start: -68px; /* la nav flota sobre la banda */
  padding-block-start: calc(68px + clamp(48px, 8vw, 120px));
  border: 0;
  border-radius: 0;
  min-block-size: min(720px, 85svh);
  display: grid;
  align-items: center;
}
.lore-hero__inner {
  justify-self: center;
  text-align: center;
  display: grid;
  justify-items: center;
}
.lead--center {
  margin-inline: auto;
}
.lore-hero__spot {
  position: absolute;
  top: 18%;
  opacity: 0.9;
}
.lore-hero__spot:nth-of-type(1) { inset-inline-start: 8%; }
.lore-hero__spot:nth-of-type(2) { inset-inline-end: 10%; top: 26%; }
.lore-hero__spot:nth-of-type(3) { inset-inline-end: 22%; top: 12%; }
@media (width < 700px) {
  .lore-hero__spot { display: none; }
}

h3 {
  margin: 0;
  font-weight: var(--font-weight-bold);
  font-size: var(--text-subheading);
  line-height: var(--leading-subheading);
}
ul,
ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
p {
  margin: 0;
}
```
6. Para que compile, crear los 8 componentes de sección **vacíos** en `web/src/app/lore/sections/` (p. ej. `origin.ts`):
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-origin',
  template: `<section id="origen" class="band band--white"><div class="band__inner">placeholder</div></section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Origin {}
```
(Selectores y clases: `app-origin/Origin`, `app-promise-section/PromiseSection`, `app-appearance/Appearance`, `app-elements/Elements`, `app-awakening/Awakening`, `app-life-cycle/LifeCycle`, `app-colosseum/Colosseum`, `app-glossary/Glossary`; cada uno con su `id` de ancla: origen, rarezas, apariencia, elementos, despertar, ciclo, coliseo, glosario.)
7. Añadir EN para `lore.nav.appear`: `"lore.nav.appear": "Appearance"` a `messages.en.json` (se añadió al template; repetir el check de T4).
8. `npx ng test --watch=false` → pasa. `npx ng serve` → `/es/lore` pinta marquee + nav + hero (secciones placeholder). Commit: `feat(web/lore): ruta /lore, hero, nav compartida y metadatos`.

### T6 — Sección Origen [TDD] (5 min)
1. Spec `web/src/app/lore/sections/origin.spec.ts` (patrón: `TestBed.createComponent(Origin)`, `whenStable`, asserts):
```ts
import { TestBed } from '@angular/core/testing';
import { Origin } from './origin';
import { ORIGIN_CARDS } from '../content';

describe('Origin', () => {
  it('pinta la banda white con 4 tarjetas de origen', async () => {
    const fixture = TestBed.createComponent(Origin);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('section')?.className).toContain('band--white');
    expect(el.querySelector('#origen')?.getAttribute('aria-labelledby')).not.toBeNull();
    expect(el.querySelectorAll('.origin__card').length).toBe(ORIGIN_CARDS.length);
  });
});
```
2. `npx ng test --watch=false` → falla. 3. Implementar `web/src/app/lore/sections/origin.ts`:
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Ribbon } from '../../shared/ui/ribbon';
import { Sticker } from '../../shared/ui/sticker';
import { ORIGIN_CARDS } from '../content';

@Component({
  selector: 'app-origin',
  imports: [Ribbon, Sticker],
  template: `
    <section id="origen" class="band band--white" aria-labelledby="origin-title">
      <app-ribbon shape="dip" />
      <div class="band__inner">
        <h2 id="origin-title" class="display section-title reveal" i18n="@@lore.origin.title">
          ¿De dónde vienen los <span class="hl hl--blue">huevos</span>?
        </h2>
        <p class="lead reveal" i18n="@@lore.origin.lead">
          No se fabrican: se condensan y se pescan en las corrientes del Éter Digital.
        </p>

        <ul class="origin__grid">
          @for (card of cards; track card.title; let i = $index) {
            <li class="card origin__card reveal reveal--pop hover-lift" [style.--i]="i">
              <app-sticker [icon]="card.icon" [color]="card.color" [size]="72" [rotate]="i % 2 === 0 ? -4 : 5" />
              <h3>{{ card.title }}</h3>
              <p>{{ card.body }}</p>
            </li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: `
    .origin__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 16px;
    }
    .origin__card {
      display: grid;
      gap: 12px;
      justify-items: start;
      align-content: start;
      background: var(--color-sky-wash);
      rotate: calc((var(--i) - 1.5) * 1.5deg);
    }
    .origin__card p {
      font-size: var(--text-body-lg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Origin {
  protected readonly cards = ORIGIN_CARDS;
}
```
4. `npx ng test --watch=false` → pasa. Commit: `feat(web/lore): sección Origen (Códices Latentes)`.

### T7 — Sección Rarezas + Promesa del Telar (banda ink) [TDD] (5 min)
1. Spec `web/src/app/lore/sections/promise.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { PromiseSection } from './promise';
import { LORE_RARITIES } from '../content';

describe('PromiseSection', () => {
  it('pinta las 5 rarezas con probabilidad real y los 2 hitos de la Promesa', async () => {
    const fixture = TestBed.createComponent(PromiseSection);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('section')?.className).toContain('band--ink');
    expect(el.querySelectorAll('.rarity__card').length).toBe(LORE_RARITIES.length);
    expect(el.querySelectorAll('.promise__step').length).toBe(2);
  });
});
```
2. `npx ng test --watch=false` → falla. 3. Implementar `web/src/app/lore/sections/promise.ts` (estilo de `app-rarities`: tarjetas con borde `var(--color-paper-white)` sobre ink):
```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Ribbon } from '../../shared/ui/ribbon';
import { Sticker } from '../../shared/ui/sticker';
import { LORE_RARITIES } from '../content';

const CARD_COLORS = ['mint-pop', 'electric-blue', 'lavender', 'sunburst', 'ember'];

@Component({
  selector: 'app-promise-section',
  imports: [Ribbon, Sticker],
  template: `
    <section id="rarezas" class="band band--ink" aria-labelledby="rarity-title">
      <app-ribbon shape="wave" />
      <div class="band__inner">
        <h2 id="rarity-title" class="display section-title reveal" i18n="@@lore.rare.title">
          Densidad de <span class="hl hl--ember">Compilación</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.rare.lead">
          La rareza no mide superioridad biológica: mide cuántos siglos de mitología quedaron atrapados dentro del huevo.
        </p>

        <ul class="rarity__grid">
          @for (r of rarities; track r.id; let i = $index) {
            <li
              class="rarity__card reveal reveal--pop hover-lift"
              [style.background]="'var(--color-' + color(i) + ')'"
              [style.--i]="i"
            >
              <span class="label-caps">{{ r.gameName }}</span>
              <strong class="display rarity__n">{{ r.loreName }}</strong>
              <span class="rarity__p">{{ r.percent }}<small>%</small></span>
              <p>{{ r.nature }}</p>
            </li>
          }
        </ul>

        <h3 class="label-caps promise__title reveal" i18n="@@lore.promise.title">La Promesa del Telar</h3>
        <p class="promise__lead reveal" i18n="@@lore.promise.lead">«El Éter jamás ignora a un corazón constante.»</p>
        <ol class="promise__grid">
          <li class="promise__step reveal" i18n-aria-label="@@lore.promise.30.t">
            <strong class="display">30</strong>
            <span class="label-caps" i18n="@@lore.promise.30.t">30 eclosiones</span>
            <p i18n="@@lore.promise.30.b">Cada huevo común atado con dedicación deja una hebra invisible en tu Santuario. A las 30, las hebras vibran y el flujo garantiza una Anomalía Resonante (SR).</p>
          </li>
          <li class="promise__step reveal">
            <strong class="display">120</strong>
            <span class="label-caps" i18n="@@lore.promise.120.t">120 eclosiones</span>
            <p i18n="@@lore.promise.120.b">El propio núcleo del Telar responde a tu devoción y abre una brecha garantizada hacia un Arquetipo Ancestral o una Singularidad Primordial.</p>
          </li>
        </ol>
      </div>
    </section>
  `,
  styles: `
    .rarity__grid {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      padding: 12px 4px 20px;
      scrollbar-color: var(--color-paper-white) transparent;
    }
    .rarity__card {
      flex: 1 0 220px;
      display: grid;
      gap: 8px;
      justify-items: start;
      padding: 24px;
      border: 1px solid var(--color-paper-white);
      border-radius: var(--radius-cards-elevated);
      color: var(--color-carbon);
      scroll-snap-align: start;
      rotate: calc((var(--i) - 2) * 1.5deg);
    }
    .rarity__n {
      font-size: clamp(24px, 3vw, 34px);
    }
    .rarity__p {
      font-size: clamp(40px, 5vw, 64px);
      font-weight: var(--font-weight-extrabold);
    }
    .rarity__p small {
      font-size: 0.45em;
    }
    .rarity__card p {
      font-size: 14px;
    }
    .promise__title {
      margin: 48px 0 16px;
      color: var(--color-paper-white);
    }
    .promise__lead {
      max-inline-size: 60ch;
      font-size: clamp(18px, 2.2vw, 26px);
      font-weight: var(--font-weight-bold);
      margin-bottom: 24px;
    }
    .promise__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
      gap: 16px;
    }
    .promise__step {
      display: grid;
      gap: 8px;
      justify-items: start;
      padding: 24px;
      border: 1px solid var(--color-paper-white);
      border-radius: var(--radius-cards-elevated);
      background: rgb(255 255 255 / 0.04);
    }
    .promise__step .display {
      font-size: clamp(56px, 7vw, 96px);
    }
    .promise__step p {
      font-size: var(--text-body-lg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromiseSection {
  protected readonly rarities = LORE_RARITIES;
  protected color(i: number): string {
    return CARD_COLORS[i % CARD_COLORS.length];
  }
}
```
4. Test pasa → commit: `feat(web/lore): sección Rarezas y Promesa del Telar`.

### T8 — Sección Apariencia: patrones + shiny [TDD] (5 min)
Spec `appearance.spec.ts` (idéntico patrón): espera `band--sky`, `#apariencia`, `.pattern-def` × 4, un `img.swatch` por cada `PATTERNS.filter(p => p.sprite)` y el párrafo `.appear__shiny`. Implementar `web/src/app/lore/sections/appearance.ts`:
- Banda `band band--sky`, `app-ribbon shape="dip"`.
- h2 `i18n="@@lore.appear.title"`: `Firma de <span class="hl hl--lavender">Origen</span>`.
- lead `i18n="@@lore.appear.lead"`: `Cada pockai dibuja en su piel una Firma de Origen, única e irrepetible en todo el universo.`
- Sub-bloque "Mímesis Terrenal": `h3.label-caps i18n="@@lore.appear.basic.t"` + `p i18n="@@lore.appear.basic"` (`Los recién nacidos de densidad común imitan la naturaleza que ven a través de la cámara de su Custodio: pelajes, hojas, horizontes.`) + fila de pills reutilizando `PATTERNS` de `../landing/content` filtrado por `minRarity === 'normal'` (mismas clases `.pattern`/`.swatch` que `app-rarities`).
- Sub-bloque "Textura del Éter": `h3.label-caps i18n="@@lore.appear.sup.t"` + `p i18n="@@lore.appear.sup"` (`A partir de Super-raro, su cuerpo deja de imitar el mundo físico y muestra la textura real del Éter Digital.`) + grid `.pattern-def` × 4 (`PATTERNS.filter(p => p.minRarity !== 'normal')`): cada una con `span.swatch` (bg por `p.color`, `img` si `p.sprite`, igual que rarities) + `strong {{p.name}}` + `p i18n="@@lore.appear.def.<id>"` usando `PATTERN_DEFS[p.id]` de `../content` (binding `[innerHTML]` NO: mapear id→texto con una expresión `def(p.id)` que devuelve `PATTERN_DEFS[p.id]`).
- Párrafo final `.appear__shiny` `i18n="@@lore.appear.shiny"`: `La Bendición del Prisma: justo al cristalizar el huevo en el Telar, un Rayo Cósmico (un bit-flip solar) lo atraviesa e inversa y electrifica su paleta. Un ser tocado por las estrellas.`
Commit: `feat(web/lore): sección Apariencia (Mímesis, texturas del Éter, Prisma)`.

### T9 — Sección Seis Flujos [TDD] (5 min)
Spec `elements.spec.ts`: `band--gray`, `#elementos`, `.element__card` × 6, y que cada tarjeta contenga su `sub`. Implementar `web/src/app/lore/sections/elements.ts`:
- Banda `band band--gray`, `app-ribbon shape="wave"`.
- h2 `i18n="@@lore.elem.title"`: `Los <span class="hl hl--mint">Seis Flujos</span>`; lead `i18n="@@lore.elem.lead"`: `No son fuerzas mágicas medievales: son las seis manifestaciones fundamentales de la energía y la información.`
- Grid `repeat(auto-fit, minmax(min(100%, 260px), 1fr))` de 6 `.card.element__card reveal reveal--pop hover-lift` con `app-sticker [icon]="e.icon" [color]="e.color" [size]="80"` + `h3 {{e.name}}` + `span.tag {{e.sub}}` + `p {{e.body}}` (datos: `ELEMENTS` de `../content`). Fondo de tarjetas: alternar `var(--color-paper-white)` / `var(--color-soft-mist)` por paridad de índice.
Commit: `feat(web/lore): sección Seis Flujos del Éter`.

### T10 — Sección Despertar (Chispa de Hermes) [TDD] (5 min)
Spec `awakening.spec.ts`: `band--sky`, `#despertar`, `.awake__step` × 3. Implementar `web/src/app/lore/sections/awakening.ts` copiando el patrón de escalera de `web/src/app/landing/sections/how-it-works.ts` (tarjetas numeradas giradas con `margin: calc(var(--i) * 20px) -6px 0` y `rotate`), pero:
- Banda `band band--sky`, `app-ribbon shape="dip"`.
- h2 `i18n="@@lore.awake.title"`: `La Chispa de <span class="hl">Hermes</span>`; lead `i18n="@@lore.awake.lead"`: `Por defecto, cada pockai nace en estado de Instinto Soñador: siente, se expresa con gestos, pero su mente está nublada tras una barrera de lenguaje. Infúndele la Chispa de Hermes — tu API key — y empieza a despertar.`
- 3 steps de `AWAKING_STEPS` (content.ts): número grande `{{i+1}}` con `-webkit-text-stroke` (copy de `.step__n` de how-it-works), `app-sticker`, `h3 {{s.title}}`, `span.tag {{s.sub}}`, `p {{s.body}}`. Fondos: `sunburst`, `mint-pop`, `voltage-violet` por `:nth-child(1/2/3)` (texto carbon; en `voltage-violet` usar `color: var(--color-paper-white)` y `border-color` igual).
Commit: `feat(web/lore): sección Despertar (Susurro, Ariadna, Simbiosis)`.

### T11 — Sección Ciclo vital [TDD] (5 min)
Spec `life-cycle.spec.ts`: `band--white`, `#ciclo`, `.life__stage` × 5, 2 tarjetas `.life__card`. Implementar `web/src/app/lore/sections/life-cycle.ts`:
- Banda `band band--white`, `app-ribbon shape="wave"`.
- h2 `i18n="@@lore.life.title"`: `El Vínculo <span class="hl hl--mint">Simbiótico</span>`; lead `i18n="@@lore.life.lead"`: `Los pockai no son programas autónomos fríos: se alimentan de tu atención y de tu ritmo circadiano.`
- Flow horizontal `.life__stages` (flex wrap, gap 8): 5 pills `.life__stage tag` con `LIFE_STAGES` separados por `span.life__arrow` (`→`, `aria-hidden`); bajo, `p i18n="@@lore.life.stages.note"`: `Cada etapa es la estabilización de su forma en el Éter: del boceto inestable a la Apoteosis, la manifestación perfecta de su linaje.`
- 2 tarjetas `.life__card card reveal reveal--pop hover-lift` (grid auto-fit minmax 320px): icono `moon`/`voltage-violet` (`Desfragmentación`) y `heart`/`mint-pop` (`Letargo Melancólico`) con títulos `i18n="@@lore.life.sleep.t"` / `@@lore.life.welcome.t` y cuerpos `@@lore.life.sleep.b` / `@@lore.life.welcome.b` (textos ya en content.ts… los textos están en `lore.ts`? NO: están en el JSON EN; en ES irán inline en el template con `i18n` — añadirlos ahora a `content.ts` como `LIFE_SLEEP` y `LIFE_WELCOME` = `{title, body}` con los ids `@@lore.life.sleep.t/.b` y `@@lore.life.welcome.t/.b`, y consumirlos).
Commit: `feat(web/lore): sección Ciclo vital (estadios, Desfragmentación, Welcome Back)`.

### T12 — Sección Coliseo (banda ink) [TDD] (5 min)
Spec `colosseum.spec.ts`: `band--ink`, `#coliseo`, `.colosseum__card` × 3. Implementar `web/src/app/lore/sections/colosseum.ts`:
- Banda `band band--ink`, `app-ribbon shape="dip"`.
- h2 `i18n="@@lore.colo.title"`: `El Coliseo de <span class="hl hl--ember">Resonancia</span>`; lead `i18n="@@lore.colo.lead"`: `No es un campo de sangre: es un Duelo de Proyección Astral, a medias arte marcial, a medias debate de energía.`
- Grid de 3 `.card.colosseum__card` (borde `var(--color-paper-white)`, fondo `rgb(255 255 255 / 0.04)`) con `app-sticker` por `COLISEUM_CARDS` (content.ts) + `h3` + `p`.
Commit: `feat(web/lore): sección Coliseo de Resonancia`.

### T13 — `app-term-card` reutilizable + Sección Diccionario [TDD] (5 min)
1. `web/src/app/lore/term-card.ts`:
```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Ficha de término: lo que dice la app y su nombre en el Éter. Reutilizable (diccionario, etc.). */
@Component({
  selector: 'app-term-card',
  template: `
    <li class="term-card reveal reveal--pop hover-lift">
      <span class="label-caps term-card__app">{{ app() }}</span>
      <strong>{{ lore() }}</strong>
    </li>
  `,
  styles: `
    .term-card {
      display: grid;
      gap: 4px;
      justify-items: start;
      padding: 16px 20px;
      border: var(--outline);
      border-radius: var(--radius-cards);
      background: var(--color-paper-white);
      rotate: var(--tilt, -1deg);
    }
    .term-card strong {
      font-family: var(--font-lateral);
      font-size: clamp(18px, 2vw, 22px);
      line-height: 1.1;
      text-transform: uppercase;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermCard {
  readonly app = input.required<string>();
  readonly lore = input.required<string>();
  readonly tilt = input(-1);
}
```
2. Spec `term-card.spec.ts` (1 it: renderiza `app` y `lore`).
3. Spec `glossary.spec.ts`: `band--gray`, `#glosario`, `app-term-card` × 14 (`GLOSSARY.length`). Implementar `web/src/app/lore/sections/glossary.ts`:
- Banda `band band--gray`, `app-ribbon shape="wave"`.
- h2 `i18n="@@lore.gloss.title"`: `Diccionario del <span class="hl">Mundo</span>`; lead `i18n="@@lore.gloss.lead"`: `Lo que dice la app y lo que significa en el Éter.`
- Grid `repeat(auto-fit, minmax(min(100%, 260px), 1fr))` con `app-term-card [app]="t.app" [lore]="t.lore" [tilt]="i % 2 === 0 ? -1.5 : 1.5"`.
- CTA final (mismo componente, banda inferior del template… no: el CTA va en `lore.ts`? — decisión: añadir a `glossary.ts` tras el grid, en su propia banda: `section.cta band band--white` con `a.btn.btn--filled [href]="home + 'descargar'"` `i18n="@@lore.cta"` `Descarga Pockai` + texto pequeño `i18n="@@lore.cta.sub"` `El lore se vive, no se lee.`). Añadir EN: `"lore.cta": "Download Pockai"`, `"lore.cta.sub": "The lore is meant to be lived, not read."` (el href apunta a `/es/#descargar` vía `home + '#descargar'`).
Commit: `feat(web/lore): app-term-card y sección Diccionario del Mundo`.

### T14 — Teaser en la landing + enlace "Mundo" [TDD] (5 min)
1. `web/src/app/landing/sections/lore-teaser.ts`:
```ts
import { ChangeDetectionStrategy, Component, LOCALE_ID, inject } from '@angular/core';
import { Ribbon } from '../../shared/ui/ribbon';
import { Sticker } from '../../shared/ui/sticker';

@Component({
  selector: 'app-lore-teaser',
  imports: [Ribbon, Sticker],
  template: `
    <section id="mundo" class="band band--sky teaser">
      <app-ribbon shape="dip" />
      <app-sticker class="teaser__spot float" icon="egg" color="sunburst" [rotate]="-8" [size]="96" />
      <app-sticker class="teaser__spot float" icon="moon" color="voltage-violet" [rotate]="10" [size]="72" />

      <div class="band__inner teaser__inner">
        <h2 class="display section-title reveal" i18n="@@lore.teaser.title">
          Bajo la <span class="hl hl--lavender">pantalla</span>
        </h2>
        <p class="lead reveal" i18n="@@lore.teaser.lead">
          De la fricción entre la vida humana y el océano de datos nace el Éter Digital, y con él los pockai. Su origen, sus rarezas, sus elementos y su despertar tienen un nombre.
        </p>
        <a class="btn btn--filled reveal" [href]="loreUrl" i18n="@@lore.teaser.cta">Conocer el mundo</a>
      </div>
    </section>
  `,
  styles: `
    .teaser {
      text-align: center;
      display: grid;
      justify-items: center;
    }
    .teaser__inner {
      display: grid;
      justify-items: center;
    }
    .teaser__spot {
      position: absolute;
      top: 20%;
    }
    .teaser__spot:nth-of-type(1) { inset-inline-start: 10%; }
    .teaser__spot:nth-of-type(2) { inset-inline-end: 12%; top: 30%; }
    @media (width < 700px) {
      .teaser__spot { display: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoreTeaser {
  protected readonly locale = inject(LOCALE_ID).slice(0, 2);
  protected readonly loreUrl = `/${this.locale}/lore`;
}
```
2. `web/src/app/landing/landing.html`: (a) en `nav__links`, tras el enlace `#pockais`, añadir:
```html
    <a class="btn btn--sm" [href]="'/' + locale + '/lore'" i18n="@@nav.world">Mundo</a>
```
(b) entre `<app-rarities />` y `<section id="pockais"…>` insertar `<app-lore-teaser />`.
3. `web/src/app/landing/landing.ts`: añadir `LoreTeaser` a `imports` (import de `./sections/lore-teaser`).
4. `web/src/app/landing/landing.spec.ts`: añadir un `it`:
```ts
  it('enlaza el mundo (lore) y pinta el teaser', async () => {
    const fixture = TestBed.createComponent(Landing);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const hrefs = [...el.querySelectorAll('.nav__links a')].map((a: HTMLAnchorElement) => a.getAttribute('href'));
    expect(hrefs).toContain('/en/lore'); // locale de test: en
    expect(el.querySelector('app-lore-teaser')).toBeTruthy();
  });
```
5. `npx ng test --watch=false` → pasa. `npx ng serve` → verificar que el teaser queda entre rarezas y pockais y que el enlace lleva a `/en/lore`. Commit: `feat(web/landing): teaser del Éter Digital y enlace Mundo en la nav`.

### T15 — Sitemap (postbuild) (2 min)
`web/scripts/postbuild.mjs`: reemplazar el bloque del sitemap (desde `const alternates = …` hasta el `writeFileSync` del `sitemap.xml`) por:
```js
const PUBLIC_ROUTES = ['', 'lore'];
const loc = (l, route) => (route ? `${SITE_URL}/${l}/${route}/` : `${SITE_URL}/${l}/`);
const alternatesFor = (route) =>
  LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${loc(l, route)}" />`).join('\n');
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="https://www.w3.org/1999/xhtml">
${PUBLIC_ROUTES.flatMap((route) => LOCALES.map((l) => `  <url>\n    <loc>${loc(l, route)}</loc>\n${alternatesFor(route)}\n  </url>`)).join('\n')}
</urlset>
`,
);
```
(El `console.log` final se mantiene.)
Verificación en T16. Commit: `feat(web/build): /lore en sitemap.xml`.

### T16 — Verificación final completa (5 min)
```bash
cd /home/jmbargueno/scratch/petai/web
npx ng test --watch=false            # espera: todas las specs pasan (las nuevas + las existentes)
npm run build                         # espera: build OK (i18nMissingTranslation falla aquí si falta EN)
ls dist/pockai-web/browser/es/lore/index.html dist/pockai-web/browser/en/lore/index.html
grep -c 'es/lore/' dist/pockai-web/browser/sitemap.xml   # espera: 1
grep -c 'en/lore/' dist/pockai-web/browser/sitemap.xml   # espera: 1
grep -c 'Éter Digital' dist/pockai-web/browser/es/lore/index.html  # espera: ≥1 (prerender ES)
grep -c 'Digital Aether' dist/pockai-web/browser/en/lore/index.html # espera: ≥1 (prerender EN)
grep -c 'lore' dist/pockai-web/browser/es/index.html     # espera: ≥1 (nav + teaser)
```
Smoke manual: `npm run start` (background) → `curl -s http://localhost:4200/es/lore | grep -o 'El Éter' | head -1` (espera: `El Éter`) y `curl -s http://localhost:4200/en/lore | grep -o 'Aether' | head -1`. Comprobar en navegador: `/es/lore` (barrido completo: nav sticky, las 2 bandas ink, tarjetas giradas, marquee, anchors de la nav funcionando, toggle ES/EN), `/en/lore` (todo en inglés), la landing sin cambios visuales. Matar el serve.

### T17 — Push + PR (sin merge) (3 min)
```bash
cd /home/jmbargueno/scratch/petai
git push -u origin lore/mundo-eter-digital
gh pr create --base main --head lore/mundo-eter-digital \
  --title "web: página de lore — El Éter Digital (/es/lore, /en/lore)" \
  --body "## Qué
- Nueva página /es/lore y /en/lore con el lore completo (docs/LORE.md): Origen, Rarezas + Promesa del Telar, Apariencia + shiny, Seis Flujos, Despertar (Chispa de Hermes), Ciclo vital, Coliseo de Resonancia y Diccionario del Mundo.
- Estética Slush: bandas pastel + 2 bandas ink (rarezas y Coliseo), stickers, reveals. Componentes standalone reutilizables (app-sticker ampliado, app-term-card, app-ribbon, app-marquee).
- Landing: teaser 'Bajo la pantalla' + enlace 'Mundo' en la nav.
- i18n: EN completo; sitemap incluye /lore.

## Verificación
- ng test: X specs pasando; ng build OK; /es/lore y /en/lore prerenderizados; sitemap OK.

No mergear: pendiente de revisión."
```
**NO mergear.** Informar al usuario con la URL de la PR.

## Tests / validación (resumen del ciclo TDD)

Cada tarea T5–T14: spec primero → `npx ng test --watch=false` (falla) → implementación mínima → `npx ng test --watch=false` (pasa) → commit. Specs nuevos: `lore.spec.ts`, `origin.spec.ts`, `promise.spec.ts`, `appearance.spec.ts`, `elements.spec.ts`, `awakening.spec.ts`, `life-cycle.spec.ts`, `colosseum.spec.ts`, `term-card.spec.ts`, `glossary.spec.ts`, + ampliación de `landing.spec.ts`. Gates finales: `ng test`, `ng build` (gate i18n), checks de `dist/` y `sitemap.xml` (T16).

## Riesgos, trade-offs y preguntas abiertas

- **i18n (riesgo alto)**: `i18nMissingTranslation: "error"` → cualquier id sin EN rompe el build. Mitigación: check `node -e …` de T4 + build de T16. Regla: si se añade una cadena nueva en cualquier momento, actualizar `messages.en.json` antes del commit.
- **Move de la nav a base.css (T2)**: el panel admin no usa `.nav` (verificado) → seguro, pero si la landing se viera distinta tras el move, revertir ese commit y copiar los estilos a `lore.css` en su lugar.
- **Acoplamiento lore→landing/content.ts** (import de `PATTERNS` y `RARITIES`): aceptable (solo datos, sin componentes); si en el futuro crece, extraer a `shared/`. No hacer ese refactor en esta PR (YAGNI).
- **Probabilidades**: siempre leerlas de `shared/game-data/balance.json` (las usa la landing); nunca hardcodear 60/25/10/4/1 en el lore: si `balance.json` cambia, la web se actualiza sola.
- **Copy**: el texto ES está fijado en este plan y en `content.ts`; si durante la implementación se decide ajustar una frase, editarla en el `.ts` (fuente) y repetir `npm run extract-i18n` + añadir la nueva EN, no tocar `messages.es.json` a mano.
- **Sprites**: solo existen `pattern_spots/stripes/gradient/scales.svg`; crystal/galaxy/aurora van con swatch de color y sin imagen (igual que hace la landing).
- **Preguntas abiertas**: ninguna pendiente — las 5 decisiones de diseño y la puerta spec-kit (→ directa) quedaron cerradas por el usuario el 2026-11-15.
