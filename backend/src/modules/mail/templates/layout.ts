import { escapeHtml, htmlToText } from './html';

/**
 * Plantilla base de todos los correos de Pockai, alineada con el diseño de la web
 * (web/src/styles/tokens.css): fondo "sky wash", tarjeta blanca con contorno de 1px en tinta y la
 * sombra dura tipo pegatina, titular en display (Bowlby One / Arial Black) en mayúsculas y botón
 * píldora violeta. Maquetada con tablas y estilos en línea para Gmail/Outlook; los extras
 * (radio, sombra, rotación del logo, fuente web) degradan sin romper en los clientes que no los soportan.
 * Siempre en claro (regla "isla clara" de la marca).
 */

/** Paleta de marca (tokens.css). */
export const BRAND = {
  carbon: '#0b0a14',
  paper: '#ffffff',
  sky: '#dceeff',
  mist: '#eeedf4',
  muted: '#4b4862',
  violet: '#5c4ade',
  violetInk: '#4a39c9',
  sunburst: '#ffd731',
  mint: '#55db9c',
  lavender: '#e9ccff',
} as const;

const DISPLAY_FONT = "'Bowlby One', 'Arial Black', 'Helvetica Neue', Arial, sans-serif";
const UI_FONT = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export interface EmailLayoutOptions {
  /** URL pública de la web (PUBLIC_WEB_URL), para el logo y los enlaces del pie. */
  webUrl: string;
  /** Asunto: va al <title>. */
  subject: string;
  /** Texto de vista previa que muestran las bandejas junto al asunto. */
  preheader?: string;
  /** Etiqueta pequeña sobre el titular (estilo "eyebrow" de la web). */
  eyebrow?: string;
  /** Titular (texto, se escapa). */
  title?: string;
  /** Cuerpo en HTML (ya seguro: los textos dinámicos deben venir escapados). */
  bodyHtml: string;
  /** Botón principal. */
  cta?: { label: string; url: string };
  /** Nota pequeña bajo el cuerpo (texto, se escapa). */
  footerNote?: string;
  /** Si se indica, el pie incluye el enlace para darse de baja de las comunicaciones. */
  unsubscribeUrl?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/** Perfiles oficiales de Pockai (usuario «pockais» en todas). */
export const SOCIAL_LINKS = [
  { name: 'Instagram', url: 'https://www.instagram.com/pockais/' },
  { name: 'TikTok', url: 'https://www.tiktok.com/@pockais' },
  { name: 'X', url: 'https://x.com/pockais' },
] as const;

const trimSlash =(u: string) => u.replace(/\/+$/, '');

/** Botón píldora "a prueba de balas" (VML para Outlook de escritorio). */
function button(label: string, url: string): string {
  const l = escapeHtml(label);
  const u = escapeHtml(url);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="center" bgcolor="${BRAND.violet}" style="border-radius:9999px;border:1px solid ${BRAND.carbon};box-shadow:3px 4px 0 ${BRAND.carbon};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="50%" strokecolor="${BRAND.carbon}" fillcolor="${BRAND.violet}">
        <w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${l}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${u}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${UI_FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:9999px;background:${BRAND.violet};background-image:linear-gradient(135deg,#6d5bff 0%,#5c4ade 45%,#3f8cff 100%);">${l}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** Monta el correo completo (HTML + alternativa en texto plano). */
export function renderEmailLayout(opts: EmailLayoutOptions): RenderedEmail {
  const web = trimSlash(opts.webUrl);
  const logo = `${web}/icon-512.png`;
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : '';

  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 14px;"><span style="display:inline-block;padding:4px 12px;border:1px solid ${BRAND.carbon};border-radius:9999px;background:${BRAND.sunburst};font-family:${UI_FONT};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.carbon};">${escapeHtml(opts.eyebrow)}</span></p>`
    : '';

  const title = opts.title
    ? `<h1 style="margin:0 0 18px;font-family:${DISPLAY_FONT};font-size:30px;line-height:1.05;font-weight:400;letter-spacing:0.01em;text-transform:uppercase;color:${BRAND.carbon};mso-line-height-rule:exactly;">${escapeHtml(opts.title)}</h1>`
    : '';

  const cta = opts.cta ? button(opts.cta.label, opts.cta.url) : '';

  const note = opts.footerNote
    ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid ${BRAND.mist};font-family:${UI_FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(opts.footerNote)}</p>`
    : '';

  const unsubscribe = opts.unsubscribeUrl
    ? `<br><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:${BRAND.muted};text-decoration:underline;">Darme de baja de estos correos</a>`
    : '';

  const social = SOCIAL_LINKS.map(
    (s) => `<a href="${escapeHtml(s.url)}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">${s.name}</a>`,
  ).join(' &nbsp;·&nbsp; ');

  const html = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(opts.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Bowlby+One&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  table { border-collapse:collapse; mso-table-lspace:0; mso-table-rspace:0; }
  .pk-body a { color:${BRAND.violetInk}; font-weight:600; }
  .pk-body p { margin:0 0 14px; }
  .pk-body h2 { font-family:${DISPLAY_FONT}; font-weight:400; text-transform:uppercase; font-size:22px; line-height:1.1; margin:22px 0 10px; color:${BRAND.carbon}; }
  .pk-body img { max-width:100%; height:auto; }
  @media (max-width:620px) {
    .pk-container { width:100% !important; }
    .pk-card { padding:28px 22px !important; border-radius:20px !important; }
    .pk-title h1 { font-size:26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.sky};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.sky};">${preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.sky}" style="background:${BRAND.sky};">
  <tr>
    <td align="center" style="padding:32px 16px 40px;">
      <table role="presentation" class="pk-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr>
          <td style="padding:0 4px 20px;">
            <a href="${escapeHtml(web)}" target="_blank" style="text-decoration:none;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="padding-right:10px;vertical-align:middle;"><img src="${escapeHtml(logo)}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;transform:rotate(-6deg);"></td>
                <td style="vertical-align:middle;font-family:${DISPLAY_FONT};font-size:24px;line-height:1;letter-spacing:0.02em;text-transform:uppercase;color:${BRAND.carbon};">Pockai</td>
              </tr></table>
            </a>
          </td>
        </tr>
        <tr>
          <td class="pk-card" bgcolor="${BRAND.paper}" style="background:${BRAND.paper};border:1px solid ${BRAND.carbon};border-radius:28px;box-shadow:4px 5px 0 ${BRAND.carbon};padding:40px 40px 36px;">
            <div class="pk-title">${eyebrow}${title}</div>
            <div class="pk-body" style="font-family:${UI_FONT};font-size:16px;line-height:1.55;font-weight:500;color:${BRAND.carbon};">
${opts.bodyHtml}
            </div>
            ${cta}
            ${note}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:26px 12px 0;font-family:${UI_FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};">
            <strong style="font-family:${DISPLAY_FONT};font-weight:400;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.carbon};">Pockai</strong>
            &nbsp;·&nbsp; <a href="${escapeHtml(web)}" style="color:${BRAND.muted};text-decoration:underline;">${escapeHtml(web.replace(/^https?:\/\//, ''))}</a>
            <br>Tu yokai de bolsillo con IA.
            <br>Síguenos: ${social}${unsubscribe}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textParts = [
    opts.title ? opts.title.toUpperCase() : '',
    htmlToText(opts.bodyHtml),
    opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : '',
    opts.footerNote ?? '',
    '— Pockai',
    `Síguenos: ${SOCIAL_LINKS.map((s) => s.url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')).join(' · ')}`,
    opts.unsubscribeUrl ? `Darte de baja: ${opts.unsubscribeUrl}` : '',
  ].filter(Boolean);

  return { html, text: textParts.join('\n\n') };
}
