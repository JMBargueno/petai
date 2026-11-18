import { z } from 'zod';
import { LlmEvent, LlmProvider } from './llm-provider';
import { SystemAiService } from './system-ai.service';

const schema = z.object({ title: z.string().min(1), n: z.number().int() }).strict();

/** Proveedor falso: cada llamada devuelve la siguiente respuesta de la lista (texto o error). */
function scripted(responses: Array<string | Error>, usage?: { promptTokens?: number; completionTokens?: number; costUsd?: number }) {
  const calls: Array<{ user: string; model: string }> = [];
  const provider: LlmProvider = {
    async *chat(messages, opts): AsyncIterable<LlmEvent> {
      calls.push({ user: messages[messages.length - 1].content, model: opts.model });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      yield { type: 'thinking', text: 'pensando…' };
      yield { type: 'delta', text: next.slice(0, 5) };
      yield { type: 'delta', text: next.slice(5) };
      yield { type: 'done', usage };
    },
    async test() {},
  };
  return { provider, calls };
}

function build(opts: { key?: string; enabled?: boolean; provider?: LlmProvider; reserve?: jest.Mock; internal?: { provider: LlmProvider; model: string } | null } = {}) {
  const config = { get: jest.fn((k: string) => (k === 'OPENROUTER_API_KEY' ? ('key' in opts ? opts.key : 'sk-test') : undefined)) };
  const billingConfig = {
    systemAiSettings: jest.fn(() => ({
      enabled: opts.enabled ?? true,
      model: 'test/model',
      fallbackModels: [],
      dailyBudgetUsd: 1,
      maxOutputTokens: 1000,
      temperature: 0.9,
      estimatePromptUsdPerMTok: 1,
      estimateCompletionUsdPerMTok: 2,
    })),
  };
  const budget = {
    reserveScoped: opts.reserve ?? jest.fn(async () => 500),
    settleScoped: jest.fn(async () => undefined),
  };
  const internalAi = { resolve: jest.fn(async () => opts.internal ?? null) };
  // Respaldo por entorno: mismo criterio que el servicio real (hay clave), con el proveedor falso
  class TestService extends SystemAiService {
    protected async resolveConnection() {
      const internal = await internalAi.resolve();
      if (internal) return { ...internal, source: 'internal' as const };
      const hasKey = 'key' in opts ? !!opts.key : true;
      return hasKey ? { provider: opts.provider, model: 'test/model', source: 'env' as const } : null;
    }
  }
  return { svc: new TestService(config as any, billingConfig as any, budget as any, internalAi as any), budget, internalAi };
}

const request = { purpose: 'test', system: 'Eres un narrador.', user: 'Escribe.', schema };

describe('SystemAiService', () => {
  it('devuelve el JSON validado y liquida el presupuesto con el coste real', async () => {
    const { provider, calls } = scripted(['{"title":"Hola","n":3}'], { promptTokens: 10, completionTokens: 20, costUsd: 0.002 });
    const { svc, budget } = build({ provider });
    const res = await svc.completeJson(request);
    expect(res).toMatchObject({ ok: true, data: { title: 'Hola', n: 3 }, model: 'test/model' });
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 20, costUsd: 0.002 });
    expect(budget.reserveScoped).toHaveBeenCalledWith('system-ai', 1, expect.any(Number));
    expect(budget.settleScoped).toHaveBeenCalledWith('system-ai', 500, 0.002);
    expect(calls).toHaveLength(1);
  });

  it('tolera el JSON envuelto en ```json y con texto alrededor', async () => {
    const { provider } = scripted(['Claro:\n```json\n{"title":"Hola","n":1}\n```']);
    const res = await build({ provider }).svc.completeJson(request);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ title: 'Hola', n: 1 });
  });

  it('reintenta con los errores de validación y acumula el consumo', async () => {
    const { provider, calls } = scripted(['{"title":"","n":"x"}', '{"title":"Bien","n":2}'], { promptTokens: 5, completionTokens: 5, costUsd: 0.001 });
    const res = await build({ provider }).svc.completeJson(request);
    expect(res.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].user).toContain('no era válida');
    expect(calls[1].user).toContain('n:');
    expect(res.usage.costUsd).toBeCloseTo(0.002);
  });

  it('se rinde con reason invalid si nunca valida', async () => {
    const { provider } = scripted(['no soy json', '{"title":1}']);
    const res = await build({ provider }).svc.completeJson(request);
    expect(res).toMatchObject({ ok: false, reason: 'invalid' });
    expect(res.data).toBeUndefined();
  });

  it('no llama al proveedor sin clave o apagada', async () => {
    const { provider, calls } = scripted(['{"title":"a","n":1}']);
    expect(await build({ provider, key: undefined }).svc.completeJson(request)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await build({ provider, enabled: false }).svc.completeJson(request)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(calls).toHaveLength(0);
    expect(await build({ provider, key: undefined }).svc.isAvailable()).toBe(false);
    expect(await build({ provider }).svc.isAvailable()).toBe(true);
  });

  it('no llama si el presupuesto diario está agotado', async () => {
    const { provider, calls } = scripted(['{"title":"a","n":1}']);
    const res = await build({ provider, reserve: jest.fn(async () => null) }).svc.completeJson(request);
    expect(res).toMatchObject({ ok: false, reason: 'budget' });
    expect(calls).toHaveLength(0);
  });

  it('un error del proveedor no lanza: reintenta y devuelve reason error', async () => {
    const { provider, calls } = scripted([new Error('timeout'), new Error('timeout')]);
    const { svc, budget } = build({ provider });
    const res = await svc.completeJson(request);
    expect(res).toMatchObject({ ok: false, reason: 'error', detail: 'timeout' });
    expect(calls).toHaveLength(2);
    // Sin respuesta se conserva la reserva: no se liquida a la baja
    expect(budget.settleScoped).not.toHaveBeenCalled();
  });

  it('usa la IA interna del panel antes que el respaldo por entorno, con su modelo', async () => {
    const internal = scripted(['{"title":"Interna","n":7}']);
    const env = scripted(['{"title":"Entorno","n":1}']);
    const res = await build({ provider: env.provider, internal: { provider: internal.provider, model: 'mi-modelo-interno' } }).svc.completeJson(request);
    expect(res).toMatchObject({ ok: true, data: { title: 'Interna', n: 7 }, model: 'mi-modelo-interno' });
    expect(internal.calls).toEqual([expect.objectContaining({ model: 'mi-modelo-interno' })]);
    expect(env.calls).toHaveLength(0);
  });

  it('con IA interna configurada está disponible aunque no haya clave en el entorno', async () => {
    const internal = scripted(['{"title":"a","n":1}']);
    const built = build({ key: undefined, internal: { provider: internal.provider, model: 'm' } });
    expect(await built.svc.isAvailable()).toBe(true);
    expect((await built.svc.completeJson(request)).ok).toBe(true);
  });

  it('rechaza salidas con datos sensibles', async () => {
    const leak = '{"title":"mi clave es sk-abcdefghijklmnopqrstuvwxyz0123456789","n":1}';
    const { provider } = scripted([leak, leak]);
    const res = await build({ provider }).svc.completeJson({ ...request, textsOf: (d) => [d.title] });
    expect(res).toMatchObject({ ok: false, reason: 'moderated' });
  });
});
