#!/usr/bin/env node
/**
 * El icono de marca de Pockai, para todas las apps.
 *
 *   node scripts/generate-app-icons.mjs
 *
 * La fuente es vectorial: `desktop/public/favicon.svg` (el huevo de marca, GUIA_ARTISTICA §2),
 * el mismo fichero que usa la web. De ahí salen:
 *
 *   desktop/src-tauri/icons/source.png                     1024², opaco, entrada de `tauri icon`
 *   .../gen/apple/PockaiWatch/Assets.xcassets/AppIcon...   el icono del reloj, que `tauri icon`
 *                                                          no conoce (spec 44)
 *   .../gen/android/.../mipmap-anydpi-v26/ic_launcher.xml  icono adaptativo con capa monocroma
 *   .../gen/android/.../drawable/ic_launcher_{background,monochrome}.xml
 *
 * El resto (escritorio, Windows, macOS, iOS y los mipmap de Android) lo escribe `tauri icon`,
 * que este script llama por ti a partir de `source.png`.
 *
 * **Sin alfa**: `actool` rechaza los iconos de app con canal alfa, así que se rasteriza sobre
 * blanco y, después, se aplanan los que escribe `tauri icon`, que sí lo deja. El huevo es un disco centrado, así que sobrevive al recorte circular de la esfera del
 * reloj y al de los iconos redondos de Android.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'desktop/public/favicon.svg');
const APPLE = join(ROOT, 'desktop/src-tauri/gen/apple');
const ANDROID = join(ROOT, 'desktop/src-tauri/gen/android/app/src/main/res');

/**
 * El huevo, rasterizado al ancho pedido y **sin canal alfa**: `actool` rechaza los iconos de app
 * que lo llevan. El `background` de resvg pinta el fondo pero deja la imagen en RGBA, así que hay
 * que aplanarla con sharp.
 */
async function render(size) {
  const png = new Resvg(readFileSync(SRC, 'utf8'), {
    fitTo: { mode: 'width', value: size },
    background: 'white',
  })
    .render()
    .asPng();
  return sharp(png).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer();
}

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`✓ ${file.slice(ROOT.length + 1)}`);
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// 1. La lámina que come `tauri icon` (escritorio, iOS y los mipmap de Android).
write(join(ROOT, 'desktop/src-tauri/icons/source.png'), await render(1024));

// 2. Escritorio, Windows, macOS, iOS y los mipmap de Android, de una pasada.
execFileSync('pnpm', ['exec', 'tauri', 'icon', 'src-tauri/icons/source.png'], {
  cwd: join(ROOT, 'desktop'),
  stdio: ['ignore', 'ignore', 'inherit'],
});
console.log('✓ tauri icon: escritorio, iOS y los mipmap de Android');

// 2b. `tauri icon` escribe los iconos de iOS en RGBA, y `actool` los rechaza con alfa. Se aplanan
//     sobre blanco, que es el fondo del propio dibujo.
const iosIcons = join(APPLE, 'Assets.xcassets/AppIcon.appiconset');
for (const file of readdirSync(iosIcons).filter((f) => f.endsWith('.png'))) {
  const path = join(iosIcons, file);
  writeFileSync(path, await sharp(path).flatten({ background: '#ffffff' }).removeAlpha().png().toBuffer());
}
console.log(`✓ ${readdirSync(iosIcons).filter((f) => f.endsWith('.png')).length} iconos de iOS, aplanados`);

// 3. El icono del reloj. Talla única moderna: `platform` en lugar del juego de roles de
//    `idiom: "watch"`, y **sin `scale`** — con `scale` presente actool pasa al esquema antiguo y
//    empieza a exigir las tallas por tamaño de caja (38/40/42/44/45/49/51 mm). Sin `appearances`:
//    watchOS no tiene icono claro y oscuro.
const watchIcons = join(APPLE, 'PockaiWatch/Assets.xcassets/AppIcon.appiconset');
write(join(watchIcons, 'AppIcon-watch-1024.png'), await render(1024));
write(
  join(watchIcons, 'Contents.json'),
  json({
    images: [
      { idiom: 'universal', platform: 'watchos', size: '1024x1024', filename: 'AppIcon-watch-1024.png' },
    ],
    info: { author: 'xcode', version: 1 },
  }),
);
write(
  join(APPLE, 'PockaiWatch/Assets.xcassets/Contents.json'),
  json({ info: { author: 'xcode', version: 1 } }),
);

// 3b. El acento de marca (GUIA_ARTISTICA §10). watchOS **no tiene modo claro**, así que el valor
//     universal es el que se ve siempre: va el violeta claro (#b3a8ff), que es el que contrasta
//     sobre negro. El #5c4ade de iOS sobre la esfera negra queda casi ilegible, comprobado en el
//     simulador.
const hex = (c) => ({ red: `0x${c.slice(1, 3)}`, green: `0x${c.slice(3, 5)}`, blue: `0x${c.slice(5, 7)}`, alpha: '1.000' });
const color = (c) => ({ 'color-space': 'srgb', components: hex(c) });
write(
  join(APPLE, 'PockaiWatch/Assets.xcassets/AccentColor.colorset/Contents.json'),
  json({
    colors: [{ idiom: 'universal', color: color('#b3a8ff') }],
    info: { author: 'xcode', version: 1 },
  }),
);

// 4. Android: el icono adaptativo que `tauri icon` no escribe. El fondo es el amarillo de marca y
//    el primer plano, el huevo recortado del SVG; la capa monocroma es la que usa Android 13 para
//    los iconos temáticos (GUIA_ARTISTICA §10).
//
//    En un icono adaptativo la zona segura es un círculo de 66 dp dentro de los 108, así que el
//    huevo se encaja ahí: el aro de marca (r=30 en un viewBox de 64) pasa a medir 66 dp.
const brand = readFileSync(SRC, 'utf8');
const paths = [...brand.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const circles = [...brand.matchAll(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"/g)].map((m) => m.slice(1).map(Number));

/** El dibujo del SVG (viewBox 64) encajado en la zona segura de un lienzo de 108. */
const SCALE = 66 / 60; // el aro mide 60 de los 64 del viewBox; la zona segura, 66 de 108
const OFFSET = (108 - 64 * SCALE) / 2;
const INSET =
  `android:scaleX="${SCALE}" android:scaleY="${SCALE}" ` +
  `android:translateX="${OFFSET}" android:translateY="${OFFSET}"`;
const eggPath = paths[0];
const [ring, ...eyes] = circles;

// El fondo es un color y no un drawable: `tauri icon` ya escribe este mismo recurso (con el blanco
// que muestrea de la lámina), así que se sobrescribe en lugar de dejar dos fuentes con el mismo
// nombre. Como este script corre después, manda el amarillo de marca.
write(
  join(ANDROID, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERADO por scripts/generate-app-icons.mjs. El amarillo de marca (GUIA_ARTISTICA §2). -->
<resources>
  <color name="ic_launcher_background">#FFD731</color>
</resources>
`,
);
rmSync(join(ANDROID, 'drawable/ic_launcher_background.xml'), { force: true });

const foreground = (fill, stroke, eye) => `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERADO por scripts/generate-app-icons.mjs desde desktop/public/favicon.svg. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <group ${INSET}>
        <path android:pathData="M${eggPath.slice(1)}"
            android:fillColor="${fill}" android:strokeColor="${stroke}" android:strokeWidth="3"/>
${eyes
  .map(
    ([cx, cy, r]) =>
      `        <path android:fillColor="${eye}" android:pathData="M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 -${r * 2},0z"/>`,
  )
  .join('\n')}
    </group>
</vector>
`;

write(join(ANDROID, 'drawable/ic_launcher_foreground.xml'), foreground('#ffffff', '#000000', '#000000'));
// La capa monocroma la tiñe el sistema: solo cuenta la silueta, así que va toda del mismo color.
write(join(ANDROID, 'drawable/ic_launcher_monochrome.xml'), foreground('#ffffff', '#ffffff', '#ffffff'));
write(
  join(ANDROID, 'mipmap-anydpi-v26/ic_launcher.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
write(
  join(ANDROID, 'mipmap-anydpi-v26/ic_launcher_round.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);

// El robot verde de la plantilla de Android Studio ya no lo usa nadie.
rmSync(join(ANDROID, 'drawable-v24/ic_launcher_foreground.xml'), { force: true });
rmSync(join(ANDROID, 'drawable-v24'), { force: true, recursive: true });
console.log('✓ fuera el robot de la plantilla (drawable-v24)');

