// Completa la salida estática de `ng build`:
//  1. index.html en la raíz que redirige a /es/ o /en/ según el idioma del navegador.
//  2. Copias del shell CSR en cada ruta del panel, para que /es/admin/… abra en cualquier
//     hosting estático sin reglas de reescritura.
//  3. robots.txt, sitemap.xml y llms.txt (solo rutas públicas; el panel queda fuera).
// El dominio y los idiomas salen de src/app/site.json, la misma fuente que usan canonical y hreflang.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(web, 'dist', 'pockai-web', 'browser');
const site = JSON.parse(readFileSync(join(web, 'src', 'app', 'site.json'), 'utf8'));
const SITE_URL = site.url.replace(/\/$/, '');
const SITE_NAME = site.name;
const LOCALES = site.locales;
const ADMIN_LOCALE = 'es';
const ADMIN_ROUTES = ['', 'login', 'resumen', 'precios', 'eventos', 'usuarios', 'invitaciones', 'pockais', 'facturacion', 'registro'];

for (const locale of LOCALES) {
  if (!existsSync(join(out, locale, 'index.html'))) {
    throw new Error(`postbuild: falta ${locale}/index.html; ¿ha fallado el prerender?`);
  }
}

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Pockai</title>
    <meta name="robots" content="noindex" />
    <script>
      location.replace((navigator.language || 'es').toLowerCase().startsWith('es') ? '/es/' : '/en/');
    </script>
    <noscript><meta http-equiv="refresh" content="0;url=/es/" /></noscript>
  </head>
  <body>
    <a href="/es/">Español</a> · <a href="/en/">English</a>
  </body>
</html>
`,
);

const shell = join(out, ADMIN_LOCALE, 'index.csr.html');
if (!existsSync(shell)) throw new Error('postbuild: falta index.csr.html para el panel');
for (const route of ADMIN_ROUTES) {
  const dir = join(out, ADMIN_LOCALE, 'admin', route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(shell, join(dir, 'index.html'));
}

// Recursos compartidos en la raíz: og:image, iconos y manifest se enlazan con URL absoluta
// (/og/…, /favicon.svg…), pero Angular los copia dentro de cada idioma.
for (const asset of ['og', 'favicon.svg', 'apple-touch-icon.png', 'icon-512.png', 'manifest.webmanifest']) {
  cpSync(join(out, LOCALES[0], asset), join(out, asset), { recursive: true });
}

const es404 = join(out, 'es', '404', 'index.html');
if (existsSync(es404)) {
  copyFileSync(es404, join(out, '404.html'));
}


// ── robots.txt ──
// RFC 9309: un rastreador solo obedece el grupo más específico que lo nombra, así que cada
// grupo con nombre repite las reglas del panel. Bots de búsqueda con IA permitidos (citan y
// enlazan); los de entrenamiento también, en grupos propios para poder cambiarlos aquí.
const PRIVATE = LOCALES.map((l) => `Disallow: /${l}/admin`).join('\n');
const AI_SEARCH = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
const AI_TRAINING = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Applebot-Extended'];
const group = (agents, rules) => `${agents.map((a) => `User-agent: ${a}`).join('\n')}\n${rules}\n`;
writeFileSync(
  join(out, 'robots.txt'),
  [
    group(['*'], `Allow: /\n${PRIVATE}`),
    '# Búsqueda con IA: pueden citar y enlazar la web.',
    group(AI_SEARCH, `Allow: /\n${PRIVATE}`),
    '# Entrenamiento de modelos: permitido; cambiar a "Disallow: /" para excluirse.',
    group(AI_TRAINING, `Allow: /\n${PRIVATE}`),
    `Sitemap: ${SITE_URL}/sitemap.xml\n`,
  ].join('\n'),
);

// ── sitemap.xml ── (solo rutas públicas e indexables; hreflang completo con x-default)
const SITEMAP_ROUTES = ['', 'pockais', 'arena', 'lore'];
let lastmod = new Date().toISOString().slice(0, 10);
try {
  lastmod = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'src'], { cwd: web, encoding: 'utf8' }).trim() || lastmod;
} catch {
  /* sin git: fecha del build */
}
const routeUrl = (l, r) => `${SITE_URL}/${l}/${r}`;
const sitemapEntry = (l, r) => {
  const alts = [...LOCALES.map((x) => [x, routeUrl(x, r)]), ['x-default', routeUrl(LOCALES[0], r)]]
    .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}" />`)
    .join('\n');
  return `  <url>\n    <loc>${routeUrl(l, r)}</loc>\n    <lastmod>${lastmod}</lastmod>\n${alts}\n  </url>`;
};
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LOCALES.flatMap((l) => SITEMAP_ROUTES.map((r) => sitemapEntry(l, r))).join('\n')}
</urlset>
`,
);

// ── llms.txt ── (formato llmstxt.org: H1, resumen y listas de enlaces)
writeFileSync(
  join(out, 'llms.txt'),
  `# ${SITE_NAME}

> Pockai es una mascota virtual con inteligencia artificial para Windows y Android: eclosionas un huevo, cuidas a la criatura, combates en la Arena y conversas con ella. Pockai is an AI virtual pet for Windows and Android.

## Español

- [Inicio](${routeUrl('es', '')}): qué es Pockai, funciones, demo jugable, precios, descargas y preguntas frecuentes.
- [Pockais](${routeUrl('es', 'pockais')}): especies, probabilidades reales de cada rareza, variante shiny y patrones.
- [Arena](${routeUrl('es', 'arena')}): combates asíncronos, ventajas elementales, estrategias, ligas y habilidades.
- [El Éter Digital](${routeUrl('es', 'lore')}): el lore del juego: origen de los huevos, rarezas, elementos, despertar de la IA y Coliseo.

## English

- [Home](${routeUrl('en', '')}): what Pockai is, features, playable demo, pricing, downloads and FAQ.
- [Pockais](${routeUrl('en', 'pockais')}): species, real odds for each rarity, the shiny variant and patterns.
- [Arena](${routeUrl('en', 'arena')}): asynchronous battles, elemental advantages, strategies, leagues and skills.
- [The Digital Aether](${routeUrl('en', 'lore')}): the game's lore: where eggs come from, rarities, elements, AI awakening and the Colosseum.

## Optional

- [Sitemap](${SITE_URL}/sitemap.xml)
`,
);

console.log(`postbuild: raíz, ${ADMIN_ROUTES.length} rutas del panel, robots.txt, sitemap.xml y llms.txt (${SITE_URL})`);
