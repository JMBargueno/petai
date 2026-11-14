import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { isIP } from 'net';
import { PrismaService } from '../../prisma/prisma.service';

export interface RegisterWebhookDto {
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookEvent {
  event: string;
  petId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

const MAX_WEBHOOKS_PER_USER = 10;
const MAX_CONSECUTIVE_FAILURES = 5;
const RETRY_DELAYS_MS = [1000, 5000, 30000];
const KNOWN_EVENTS = [
  'pet.evolved',
  'combat.finished',
  'level.up',
  'ai.reminder.created',
  'season.ended',
];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterWebhookDto) {
    this.validateUrl(dto.url);
    if (!Array.isArray(dto.events) || dto.events.length === 0) {
      throw new BadRequestException('events no puede estar vacío');
    }
    const unknown = dto.events.filter((e) => !KNOWN_EVENTS.includes(e));
    if (unknown.length > 0) {
      this.logger.warn(`Eventos no estándar aceptados: ${unknown.join(', ')}`);
    }

    const count = await this.prisma.webhook.count({ where: { userId } });
    if (count >= MAX_WEBHOOKS_PER_USER) {
      throw new ConflictException(`Máximo ${MAX_WEBHOOKS_PER_USER} webhooks por usuario`);
    }

    const secret = dto.secret || randomBytes(24).toString('hex');
    const webhook = await this.prisma.webhook.create({
      data: { userId, url: dto.url, secret, events: dto.events },
    });

    return {
      id: webhook.id,
      url: webhook.url,
      events: webhook.events as string[],
      secret,
      active: webhook.active,
      createdAt: webhook.createdAt,
    };
  }

  async list(userId: string) {
    const webhooks = await this.prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return webhooks.map((w) => this.toPublic(w));
  }

  async remove(userId: string, id: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!webhook) throw new NotFoundException('Webhook no encontrado');
    if (webhook.userId !== userId) throw new ConflictException('No es tu webhook');
    await this.prisma.webhook.delete({ where: { id } });
    return { message: 'Webhook eliminado' };
  }

  async test(userId: string, id: string) {
    const webhook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!webhook) throw new NotFoundException('Webhook no encontrado');
    if (webhook.userId !== userId) throw new ConflictException('No es tu webhook');
    const result = await this.deliver(webhook, {
      event: 'webhook.test',
      userId: webhook.userId,
      data: { test: true },
    });
    return { delivered: result.status === 'delivered', statusCode: result.statusCode };
  }

  async dispatch(event: WebhookEvent): Promise<number> {
    if (!event.userId) return 0;
    const webhooks = await this.prisma.webhook.findMany({
      where: { userId: event.userId, active: true },
    });
    const subscribed = webhooks.filter((w) =>
      (w.events as string[]).includes(event.event),
    );
    let delivered = 0;
    await Promise.all(
      subscribed.map(async (w) => {
        const result = await this.deliver(w, event);
        if (result.status === 'delivered') delivered++;
      }),
    );
    return delivered;
  }

  sign(secret: string, timestamp: string, body: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  }

  private async deliver(
    webhook: { id: string; url: string; secret: string; failureCount: number },
    event: WebhookEvent,
  ): Promise<{ status: string; statusCode: number | null }> {
    const body = JSON.stringify({
      event: event.event,
      petId: event.petId ?? null,
      userId: event.userId ?? null,
      data: event.data ?? {},
      timestamp: new Date().toISOString(),
    });

    let status: string = 'pending';
    let statusCode: number | null = null;
    let error: string | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const timestamp = new Date().toISOString();
      const signature = this.sign(webhook.secret, timestamp, body);
      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Petai-Event': event.event,
            'X-Petai-Timestamp': timestamp,
            'X-Petai-Signature': `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        if (res.ok) {
          status = 'delivered';
          error = null;
          break;
        }
        error = `HTTP ${res.status}`;
      } catch (err) {
        status = 'failed';
        error = (err as Error)?.message ?? 'network error';
      }
      if (attempt < RETRY_DELAYS_MS.length) {
        await this.sleep(RETRY_DELAYS_MS[attempt]);
      }
    }

    const success = status === 'delivered';
    await this.prisma.webhookDelivery
      .create({
        data: {
          webhookId: webhook.id,
          event: event.event,
          status,
          statusCode,
          attempts: RETRY_DELAYS_MS.length + 1,
          error,
        },
      })
      .catch(() => undefined);

    await this.prisma.webhook
      .update({
        where: { id: webhook.id },
        data: success
          ? { lastDeliveryAt: new Date(), failureCount: 0 }
          : { failureCount: { increment: 1 } },
      })
      .catch(() => undefined);

    if (!success) {
      const updated = await this.prisma.webhook
        .findUnique({ where: { id: webhook.id } })
        .catch(() => null);
      if (updated && updated.failureCount >= MAX_CONSECUTIVE_FAILURES) {
        await this.prisma.webhook
          .update({ where: { id: webhook.id }, data: { active: false } })
          .catch(() => undefined);
        this.logger.warn(`Webhook ${webhook.id} desactivado por ${MAX_CONSECUTIVE_FAILURES} fallos`);
      }
    }

    return { status, statusCode };
  }

  private validateUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('URL inválida');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('El webhook debe usar HTTPS');
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '0.0.0.0') {
      throw new BadRequestException('Host no permitido (localhost)');
    }
    if (host === 'metadata.google.internal' || host.endsWith('.internal')) {
      throw new BadRequestException('Endpoint de metadatos no permitido (SSRF)');
    }
    if (isIP(host) && this.isPrivateIp(host)) {
      throw new BadRequestException('IP privada no permitida (SSRF)');
    }
  }

  private isPrivateIp(ip: string): boolean {
    if (isIP(ip) === 6) {
      if (ip === '::1' || ip.toLowerCase().startsWith('fe80')) return true;
      return false;
    }
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private toPublic(w: {
    id: string;
    url: string;
    events: unknown;
    active: boolean;
    lastDeliveryAt: Date | null;
    failureCount: number;
    createdAt: Date;
  }) {
    return {
      id: w.id,
      url: w.url,
      events: w.events as string[],
      active: w.active,
      lastDeliveryAt: w.lastDeliveryAt,
      failureCount: w.failureCount,
      createdAt: w.createdAt,
    };
  }
}
