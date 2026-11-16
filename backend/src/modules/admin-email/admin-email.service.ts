import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EMAIL_SENDER, EmailSender } from '../mail/email.service';
import { renderEmailLayout } from '../mail/templates/layout';
import { stripDangerousHtml } from '../mail/templates/html';
import { parseOrBadRequest } from '../auth/dto/auth.schemas';
import { EMAIL_CAMPAIGNS_QUEUE } from '../../queues/queue.constants';
import {
  Audience,
  EmailContent,
  audienceSchema,
  campaignSchema,
  contentSchema,
  countSchema,
  previewSchema,
} from './admin-email.schemas';
import { UnsubscribeTokens } from './unsubscribe';

const BATCH_SIZE = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Destinatario resuelto: correo y, si es una cuenta, su id (para el enlace de baja). */
interface Recipient {
  email: string;
  userId?: string;
}

/** Campos de la campaña que ve el panel (sin el HTML completo en el listado). */
const CAMPAIGN_LIST_SELECT = {
  id: true,
  subject: true,
  audience: true,
  status: true,
  total: true,
  sent: true,
  failed: true,
  lastError: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  createdBy: { select: { id: true, email: true, displayName: true } },
} as const;

/**
 * Envíos de correo desde el panel de administración.
 *
 * El staff escribe asunto, preencabezado y un cuerpo en HTML libre; el cuerpo se envuelve en la
 * plantilla de marca (mail/templates/layout.ts). Destinatarios: usuarios concretos, una lista de
 * correos o un segmento (todos / por rol / verificados o no). Nunca se envía a quien se dio
 * de baja (`User.emailOptOutAt`) y todos los correos a cuentas llevan enlace de baja +
 * `List-Unsubscribe` (LSSI / RFC 8058). El envío real lo hace la cola `email-campaigns` por lotes y
 * con un ritmo máximo (EMAIL_CAMPAIGN_RATE_PER_SECOND) para cuidar la reputación del SMTP.
 */
@Injectable()
export class AdminEmailService {
  private readonly logger = new Logger(AdminEmailService.name);
  readonly unsubscribe: UnsubscribeTokens;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @InjectQueue(EMAIL_CAMPAIGNS_QUEUE) private readonly queue: Queue,
  ) {
    this.unsubscribe = new UnsubscribeTokens(
      this.config.get<string>('MAIL_UNSUBSCRIBE_SECRET'),
      this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev',
    );
  }

  private get webUrl() {
    return (this.config.get<string>('PUBLIC_WEB_URL') || 'https://pockai.world').replace(/\/+$/, '');
  }

  private get apiUrl() {
    const base = (this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3000').replace(/\/+$/, '');
    return `${base}/${this.config.get<string>('API_PREFIX') || 'v1'}`;
  }

  private get ratePerSecond() {
    const v = Number(this.config.get('EMAIL_CAMPAIGN_RATE_PER_SECOND'));
    return Number.isFinite(v) && v > 0 ? v : 5;
  }

  /** URL de baja (página de confirmación servida por la API) para una cuenta. */
  unsubscribeUrl(userId: string) {
    return `${this.apiUrl}/email/unsubscribe?token=${encodeURIComponent(this.unsubscribe.create(userId))}`;
  }

  /** Renderiza el correo con la plantilla de marca. */
  render(content: { subject: string; preheader?: string; html: string }, unsubscribeUrl?: string) {
    return renderEmailLayout({
      webUrl: this.webUrl,
      subject: content.subject,
      preheader: content.preheader,
      bodyHtml: stripDangerousHtml(content.html),
      unsubscribeUrl,
    });
  }

  preview(raw: unknown) {
    const input = parseOrBadRequest(previewSchema, raw);
    // Enlace de baja de ejemplo para que la vista previa muestre el pie real.
    return { html: this.render(input, `${this.apiUrl}/email/unsubscribe?token=preview`).html };
  }

  // ---------------------------------------------------------------- destinatarios

  /** Filtro de Prisma de un segmento (siempre excluye las bajas). */
  private segmentWhere(a: Extract<Audience, { type: 'segment' }>): Prisma.UserWhereInput {
    return {
      emailOptOutAt: null,
      ...(a.role ? { role: a.role } : {}),
      ...(a.verified === 'verified' ? { emailVerifiedAt: { not: null } } : {}),
      ...(a.verified === 'unverified' ? { emailVerifiedAt: null } : {}),
    };
  }

  private dedupe(emails: string[]) {
    return [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  }

  async count(audience: Audience): Promise<number> {
    switch (audience.type) {
      case 'emails': {
        // Las direcciones de cuentas dadas de baja no cuentan (tampoco se les envía).
        const emails = this.dedupe(audience.emails);
        const optedOut = await this.prisma.user.count({ where: { email: { in: emails }, emailOptOutAt: { not: null } } });
        return emails.length - optedOut;
      }
      case 'users':
        return this.prisma.user.count({ where: { id: { in: audience.userIds }, emailOptOutAt: null } });
      case 'segment':
        return this.prisma.user.count({ where: this.segmentWhere(audience) });
    }
  }

  async countRaw(raw: unknown) {
    const { audience } = parseOrBadRequest(countSchema, raw);
    return { count: await this.count(audience) };
  }

  /** Siguiente lote de destinatarios a partir del cursor (id de usuario o índice de la lista). */
  private async nextBatch(audience: Audience, cursor: string | null): Promise<{ recipients: Recipient[]; cursor: string | null }> {
    if (audience.type === 'emails') {
      const all = this.dedupe(audience.emails);
      const start = cursor ? Number(cursor) : 0;
      const slice = all.slice(start, start + BATCH_SIZE);
      if (slice.length === 0) return { recipients: [], cursor: null };
      // Si el correo es de una cuenta, el envío lleva su enlace de baja.
      const users = await this.prisma.user.findMany({
        where: { email: { in: slice } },
        select: { id: true, email: true, emailOptOutAt: true },
      });
      const byEmail = new Map(users.map((u) => [u.email, u]));
      return {
        // Nunca a quien se dio de baja, aunque se escriba su correo a mano.
        recipients: slice
          .filter((email) => !byEmail.get(email)?.emailOptOutAt)
          .map((email) => ({ email, userId: byEmail.get(email)?.id })),
        cursor: String(start + slice.length),
      };
    }
    const where: Prisma.UserWhereInput =
      audience.type === 'users' ? { id: { in: audience.userIds }, emailOptOutAt: null } : this.segmentWhere(audience);
    const users = await this.prisma.user.findMany({
      // AND (no spread): el cursor sobre `id` no debe pisar el filtro `id: { in }` de "usuarios concretos".
      where: cursor ? { AND: [where, { id: { gt: cursor } }] } : where,
      select: { id: true, email: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (users.length === 0) return { recipients: [], cursor: null };
    return { recipients: users.map((u) => ({ email: u.email, userId: u.id })), cursor: users[users.length - 1].id };
  }

  // ---------------------------------------------------------------- envíos

  private async deliver(content: EmailContent, r: Recipient) {
    const unsubscribeUrl = r.userId ? this.unsubscribeUrl(r.userId) : undefined;
    const mail = this.render(content, unsubscribeUrl);
    await this.email.sendRaw({
      to: r.email,
      subject: content.subject,
      html: mail.html,
      text: mail.text,
      headers: unsubscribeUrl
        ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
        : undefined,
    });
  }

  /** Envío de prueba al correo del propio admin. */
  async sendTest(actor: { id: string; email: string }, raw: unknown) {
    const content = parseOrBadRequest(contentSchema, raw);
    try {
      await this.deliver({ ...content, subject: `[Prueba] ${content.subject}` }, { email: actor.email, userId: actor.id });
    } catch (err) {
      this.logger.error(`Fallo en el envío de prueba a ${actor.email}: ${(err as Error).message}`);
      throw new BadRequestException(`No se pudo enviar la prueba: ${(err as Error).message}`);
    }
    return { ok: true, to: actor.email };
  }

  /** Crea la campaña y la encola. */
  async create(actor: { id: string }, raw: unknown) {
    const input = parseOrBadRequest(campaignSchema, raw);
    const audience = input.audience;
    if (audience.type === 'emails') audience.emails = this.dedupe(audience.emails);
    const total = await this.count(audience);
    if (total === 0) throw new BadRequestException('No hay destinatarios para ese envío');

    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          subject: input.subject,
          preheader: input.preheader ?? null,
          html: input.html,
          audience: audience as unknown as Prisma.InputJsonValue,
          total,
          createdById: actor.id,
        },
        select: CAMPAIGN_LIST_SELECT,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          event: 'email_campaign_create',
          metadata: { campaignId: created.id, subject: input.subject, audience: summarizeAudience(audience), total },
        },
      });
      return created;
    });

    await this.queue.add(
      'send',
      { campaignId: campaign.id },
      { jobId: campaign.id, attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100, removeOnFail: 500 },
    );
    this.logger.log(`Campaña ${campaign.id} encolada: "${input.subject}" a ${total} destinatarios`);
    return campaign;
  }

  async list(query: Record<string, string>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const [items, total] = await this.prisma.$transaction([
      this.prisma.emailCampaign.findMany({ select: CAMPAIGN_LIST_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.emailCampaign.count(),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const c = await this.prisma.emailCampaign.findUnique({ where: { id }, select: { ...CAMPAIGN_LIST_SELECT, html: true, preheader: true } });
    if (!c) throw new NotFoundException('Envío no encontrado');
    return c;
  }

  /**
   * Procesa una campaña (lo llama la cola). Reanudable: avanza por lotes guardando el cursor, así
   * que un reintento tras un reinicio continúa donde se quedó sin repetir destinatarios.
   */
  async process(campaignId: string): Promise<{ sent: number; failed: number }> {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status === 'sent' || campaign.status === 'failed') {
      return { sent: campaign?.sent ?? 0, failed: campaign?.failed ?? 0 };
    }
    const audience = audienceSchema.parse(campaign.audience);
    const content: EmailContent = { subject: campaign.subject, preheader: campaign.preheader ?? undefined, html: campaign.html };
    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'sending', startedAt: campaign.startedAt ?? new Date() },
    });

    const gapMs = Math.ceil(1000 / this.ratePerSecond);
    let cursor = campaign.cursor;
    let sent = campaign.sent;
    let failed = campaign.failed;
    let lastError: string | null = campaign.lastError;

    for (;;) {
      const batch = await this.nextBatch(audience, cursor);
      if (batch.cursor === null) break;
      let batchSent = 0;
      let batchFailed = 0;
      for (const r of batch.recipients) {
        const started = Date.now();
        try {
          await this.deliver(content, r);
          batchSent++;
        } catch (err) {
          batchFailed++;
          lastError = `${r.email}: ${(err as Error).message}`.slice(0, 500);
          this.logger.warn(`Campaña ${campaignId}: fallo enviando a ${r.email}: ${(err as Error).message}`);
        }
        const wait = gapMs - (Date.now() - started);
        if (wait > 0) await sleep(wait);
      }
      sent += batchSent;
      failed += batchFailed;
      cursor = batch.cursor;
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { cursor, sent, failed, lastError },
      });
    }

    const status = sent === 0 && failed > 0 ? 'failed' : 'sent';
    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status, finishedAt: new Date(), total: Math.max(campaign.total, sent + failed) },
    });
    this.logger.log(`Campaña ${campaignId} terminada: ${sent} enviados, ${failed} fallidos`);
    return { sent, failed };
  }

  /** Marca la campaña como fallida (la cola agotó los reintentos). */
  async markFailed(campaignId: string, error: string) {
    await this.prisma.emailCampaign.updateMany({
      where: { id: campaignId, status: { in: ['queued', 'sending'] } },
      data: { status: 'failed', lastError: error.slice(0, 500), finishedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------- bajas

  /** Aplica la baja de un enlace firmado. Devuelve false si el enlace no es válido. */
  async applyUnsubscribe(token: unknown): Promise<boolean> {
    const userId = this.unsubscribe.verify(token);
    if (!userId) return false;
    const res = await this.prisma.user.updateMany({ where: { id: userId, emailOptOutAt: null }, data: { emailOptOutAt: new Date() } });
    if (res.count > 0) this.logger.log(`Baja de correos informativos: ${userId}`);
    // Un usuario borrado o ya dado de baja también es un éxito para quien pulsa el enlace.
    return true;
  }

  /** Página HTML (con la plantilla de marca) para la confirmación de baja. */
  unsubscribePage(state: 'confirm' | 'done' | 'invalid', token?: string) {
    const bodies = {
      confirm: `<p>¿Quieres dejar de recibir los correos informativos de Pockai (novedades y eventos)?</p>
<p>Seguirás recibiendo los correos necesarios de tu cuenta, como la verificación o la recuperación de contraseña.</p>
<form method="post" style="margin:24px 0 0;"><input type="hidden" name="token" value="${(token ?? '').replace(/[^\w.-]/g, '')}">
<button type="submit" style="cursor:pointer;padding:14px 28px;border:1px solid #0b0a14;border-radius:9999px;background:#5c4ade;color:#ffffff;font:700 16px Inter,Arial,sans-serif;box-shadow:3px 4px 0 #0b0a14;">Darme de baja</button></form>`,
      done: '<p>Listo: ya no te enviaremos correos informativos. Si cambias de idea, escríbenos a contact@pockai.world.</p>',
      invalid: '<p>Este enlace de baja no es válido. Si necesitas ayuda, escríbenos a contact@pockai.world.</p>',
    };
    const titles = { confirm: 'Darte de baja', done: 'Baja confirmada', invalid: 'Enlace no válido' };
    return renderEmailLayout({ webUrl: this.webUrl, subject: titles[state], title: titles[state], bodyHtml: bodies[state] }).html;
  }
}

/** Resumen corto del destinatario para la auditoría (sin listar cientos de correos). */
function summarizeAudience(a: Audience) {
  switch (a.type) {
    case 'emails':
      return { type: 'emails', count: a.emails.length };
    case 'users':
      return { type: 'users', count: a.userIds.length };
    case 'segment':
      return { type: 'segment', role: a.role ?? 'all', verified: a.verified };
  }
}
