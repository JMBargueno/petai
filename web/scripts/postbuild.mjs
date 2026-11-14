// Completa la salida estática de `ng build`:
//  1. index.html en la raíz que redirige a /es/ o /en/ según el idioma del navegador.
//  2. Copias del shell CSR en cada ruta del panel, para que /es/admin/… abra en cualquier
//     hosting estático sin reglas de reescritura.
//  3. robots.txt y sitemap.xml (solo rutas públicas; el panel queda fuera).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(web, 'dist', 'pockai-web', 'browser');
const SITE_URL = (process.env.SITE_URL ?? 'https://pockai.example').replace(/\/$/, '');
const LOCALES = ['es', 'en'];
const ADMIN_LOCALE = 'es';
const ADMIN_ROUTES = ['', 'login', 'resumen', 'precios', 'eventos', 'usuarios', 'pockais', 'registro'];

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

writeFileSync(
  join(out, 'robots.txt'),
  `User-agent: *\nDisallow: /es/admin\nDisallow: /en/admin\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
);

const alternates = LOCALES.map(
  (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${SITE_URL}/${l}/" />`,
).join('\n');
writeFileSync(
  join(out, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LOCALES.map((l) => `  <url>\n    <loc>${SITE_URL}/${l}/</loc>\n${alternates}\n  </url>`).join('\n')}
</urlset>
`,
);

console.log(`postbuild: raíz, ${ADMIN_ROUTES.length} rutas del panel, robots.txt y sitemap.xml (${SITE_URL})`);
