import { BRAND, RenderedEmail, renderEmailLayout } from './layout';
import { escapeHtml } from './html';

/** Bloque destacado con un código de 6 dígitos (estilo "sticker" de la web). */
function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px;">
  <tr>
    <td bgcolor="${BRAND.sunburst}" style="background:${BRAND.sunburst};border:1px solid ${BRAND.carbon};border-radius:16px;box-shadow:3px 4px 0 ${BRAND.carbon};padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:0.28em;color:${BRAND.carbon};">${escapeHtml(code)}</td>
  </tr>
</table>`;
}

export interface VerificationEmailInput {
  webUrl: string;
  code: string;
  link: string;
  expiresInMinutes: number;
  displayName?: string | null;
}

const humanDuration = (minutes: number) =>
  minutes >= 120 && minutes % 60 === 0 ? `${minutes / 60} horas` : `${minutes} minutos`;

/** Correo de verificación de cuenta: código para la app + enlace a la web. */
export function verificationEmail(input: VerificationEmailInput): RenderedEmail & { subject: string } {
  const subject = 'Verifica tu correo de Pockai';
  const hello = input.displayName ? `¡Hola, ${escapeHtml(input.displayName)}!` : '¡Hola!';
  const rendered = renderEmailLayout({
    webUrl: input.webUrl,
    subject,
    preheader: `Tu código es ${input.code}. Confirma tu correo para empezar a jugar.`,
    eyebrow: 'Verificación de cuenta',
    title: 'Confirma tu correo',
    bodyHtml: `<p>${hello} Tu yokai está a punto de eclosionar. Solo falta confirmar que este correo es tuyo.</p>
<p>Escribe este código en la app de Pockai:</p>
${codeBlock(input.code)}
<p style="margin-top:22px;">O, si lo prefieres, verifica tu cuenta desde la web:</p>`,
    cta: { label: 'Verificar mi correo', url: input.link },
    footerNote: `El código y el enlace caducan en ${humanDuration(input.expiresInMinutes)}. Si no has creado una cuenta en Pockai, ignora este correo.`,
  });
  return { subject, ...rendered };
}

/** Correo de recuperación de contraseña (código de 6 dígitos). */
export function passwordResetEmail(input: {
  webUrl: string;
  code: string;
  expiresInMinutes: number;
}): RenderedEmail & { subject: string } {
  const subject = 'Tu código de recuperación de Pockai';
  const rendered = renderEmailLayout({
    webUrl: input.webUrl,
    subject,
    preheader: `Tu código de recuperación es ${input.code}.`,
    eyebrow: 'Recuperar contraseña',
    title: 'Tu código de recuperación',
    bodyHtml: `<p>Hola, has pedido restablecer la contraseña de tu cuenta de Pockai. Escribe este código en la app:</p>
${codeBlock(input.code)}`,
    footerNote: `Caduca en ${humanDuration(input.expiresInMinutes)}. Si no lo has pedido tú, ignora este correo: tu contraseña no cambiará.`,
  });
  return { subject, ...rendered };
}
