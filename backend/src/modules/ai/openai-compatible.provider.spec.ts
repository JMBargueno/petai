import { OpenAiCompatibleProvider } from './openai-compatible.provider';

function sse(lines: string[], status = 200) {
  const enc = new TextEncoder();
  // Se parte el flujo en trozos pequeños para probar el reensamblado de líneas
  const body = lines.join('\n');
  const chunks = body.match(/[\s\S]{1,7}/g) ?? [];
  const stream = new ReadableStream({
    start(c) {
      chunks.forEach((ch) => c.enqueue(enc.encode(ch)));
      c.close();
    },
  });
  return new Response(status === 200 ? stream : 'err', { status });
}

const delta = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n`;

async function drain(p: OpenAiCompatibleProvider, model = 'm') {
  const out: any[] = [];
  for await (const ev of p.chat([{ role: 'user', content: 'hi' }], { model })) out.push(ev);
  return out;
}

describe('OpenAiCompatibleProvider', () => {
  it('emite deltas, ignora eventos extra de Hermes y devuelve el uso', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      sse([
        ': keepalive\n',
        'event: hermes.tool.progress',
        'data: {"tool":"x"}\n',
        delta('Ho'),
        delta('la'),
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2 } })}\n`,
        'data: [DONE]\n',
      ]),
    );
    const out = await drain(new OpenAiCompatibleProvider('https://x/v1', 'sk-secret', fetchMock as any));
    expect(out.filter((e) => e.type === 'delta').map((e) => e.text).join('')).toBe('Hola');
    expect(out[out.length - 1]).toEqual({ type: 'done', usage: { promptTokens: 5, completionTokens: 2 } });
  });

  it('envía auth y stream, no sigue redirecciones y no filtra la key en el body', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sse([delta('a'), 'data: [DONE]\n']));
    await drain(new OpenAiCompatibleProvider('https://x/v1', 'sk-secret', fetchMock as any), 'gpt');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://x/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-secret');
    expect(init.redirect).toBe('error');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt', stream: true });
    expect(init.body).not.toContain('sk-secret');
  });

  it.each([
    [401, 'Key rechazada'],
    [404, 'no encontrado'],
    [429, 'Límite'],
    [500, 'error 500'],
  ])('traduce el estado %i a un mensaje legible sin exponer la key', async (status, msg) => {
    const fetchMock = jest.fn().mockResolvedValue(sse([], status));
    const p = new OpenAiCompatibleProvider('https://x/v1', 'sk-secret', fetchMock as any);
    await expect(drain(p)).rejects.toThrow(msg);
    await expect(drain(p)).rejects.not.toThrow('sk-secret');
  });

  it('test() falla si no hay contenido', async () => {
    const fetchMock = jest.fn().mockResolvedValue(sse(['data: [DONE]\n']));
    const p = new OpenAiCompatibleProvider('https://x/v1', 'k', fetchMock as any);
    await expect(p.test('m')).rejects.toThrow('sin contenido');
  });

  describe('function calling', () => {
    const tc = (o: any) => `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [o] } }] })}
`;

    it('acumula los fragmentos de tool_calls por índice y los emite antes de done', async () => {
      const fetchMock = jest.fn().mockResolvedValue(sse([
        delta('Voy a mirar. '),
        tc({ index: 0, id: 'call_1', type: 'function', function: { name: 'get_my_status', arguments: '' } }),
        tc({ index: 1, id: 'call_2', type: 'function', function: { name: 'search_memory', arguments: '{"que' } }),
        tc({ index: 1, function: { arguments: 'ry":"pesca"}' } }),
        'data: [DONE]\n',
      ]));
      const out = await drain(new OpenAiCompatibleProvider('https://x/v1', 'k', fetchMock as any));
      const calls = out.filter((e) => e.type === 'tool_call');
      expect(calls).toEqual([
        { type: 'tool_call', id: 'call_1', name: 'get_my_status', arguments: '' },
        { type: 'tool_call', id: 'call_2', name: 'search_memory', arguments: '{"query":"pesca"}' },
      ]);
      expect(out[out.length - 1].type).toBe('done');
      expect(out.findIndex((e) => e.type === 'tool_call')).toBeLessThan(out.length - 1);
    });

    it('envía tools/tool_choice y traduce mensajes assistant(tool_calls) y tool', async () => {
      const fetchMock = jest.fn().mockResolvedValue(sse(['data: [DONE]\n']));
      const p = new OpenAiCompatibleProvider('https://x/v1', 'k', fetchMock as any);
      for await (const _ of p.chat(
        [
          { role: 'user', content: 'hola' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'get_my_status', arguments: '{}' }] },
          { role: 'tool', toolCallId: 'c1', content: '{"hambre":30}' },
        ],
        { model: 'm', tools: [{ name: 'get_my_status', description: 'd', parameters: { type: 'object', properties: {} } }] },
      )) { /* consume */ }
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.tool_choice).toBe('auto');
      expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'get_my_status' } });
      expect(body.messages[1]).toEqual({
        role: 'assistant', content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_my_status', arguments: '{}' } }],
      });
      expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"hambre":30}' });
    });

    it('sin tools no envía tools ni tool_choice', async () => {
      const fetchMock = jest.fn().mockResolvedValue(sse(['data: [DONE]\n']));
      await drain(new OpenAiCompatibleProvider('https://x/v1', 'k', fetchMock as any));
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
    });
  });
});
