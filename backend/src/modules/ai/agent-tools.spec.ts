import {
  CLIENT_TOOL_NAMES,
  TOOL_BY_NAME,
  TOOLS,
  isBlockedHost,
  parseToolArguments,
  sanitizeClientTools,
  toolDefinitions,
} from './agent-tools';

const NOW = new Date('2026-11-13T12:00:00Z');
const reminder = TOOL_BY_NAME.get('create_reminder')!;

describe('agent-tools', () => {
  it('las herramientas con efectos (servidor o escritorio) siempre requieren confirmación; el resto son de lectura', () => {
    expect(TOOLS.filter((t) => t.requiresConfirmation).map((t) => t.name).sort()).toEqual([
      'create_reminder', 'open_url', 'read_clipboard',
    ]);
    expect(TOOLS.filter((t) => t.clientSide).every((t) => t.requiresConfirmation)).toBe(true);
    expect(toolDefinitions().map((t) => t.name).sort()).toEqual([
      'create_reminder', 'get_my_status', 'list_reminders', 'request_food', 'search_memory', 'suggest_minigame',
    ]);
  });

  it('ninguna herramienta acepta identificadores de usuario o mascota como parámetro', () => {
    for (const t of TOOLS) {
      const props = Object.keys((t.parameters as any).properties ?? {});
      expect(props.filter((p) => /user|pet|owner/i.test(p))).toEqual([]);
    }
  });

  describe('create_reminder', () => {
    const ok = (a: any) => reminder.validate(a, NOW);

    it('acepta texto y fecha futura y normaliza a ISO UTC', () => {
      const r = ok({ text: ' Sacar la basura ', due_at: '2026-11-14T09:30:00+01:00' });
      expect(r).toEqual({ ok: true, args: { text: 'Sacar la basura', due_at: '2026-11-14T08:30:00.000Z' } });
    });

    it.each([
      [{}, 'Se requieren'],
      [{ text: 'x', due_at: '2026-11-14T09:30:00Z' }, 'vacío'],
      [{ text: 'algo', due_at: 'mañana' }, 'ISO 8601'],
      [{ text: 'algo', due_at: '2026-13-45T99:99:00Z' }, 'no es una fecha válida'],
      [{ text: 'algo', due_at: '2026-11-13T11:00:00Z' }, 'futuro'],
      [{ text: 'algo', due_at: '2026-11-13T12:00:10Z' }, 'futuro'],
      [{ text: 'algo', due_at: '2028-01-01T00:00:00Z' }, 'un año'],
      [{ text: 42, due_at: '2026-11-14T09:30:00Z' }, 'Se requieren'],
    ])('rechaza %j', (args, msg) => {
      const r = ok(args);
      expect(r.ok).toBe(false);
      expect((r as any).error).toContain(msg);
    });

    it('limpia el texto (control y < >) y lo acota a 200 caracteres', () => {
      const r: any = ok({ text: '<script>x</script>\n' + 'a'.repeat(400), due_at: '2026-11-14T09:30:00Z' });
      expect(r.args.text).not.toMatch(/[<>\n]/);
      expect(r.args.text.length).toBe(200);
    });

    it('la descripción de la tarjeta la genera el servidor con la zona horaria del usuario', () => {
      const d = reminder.describe!({ text: 'Sacar la basura', due_at: '2026-11-14T08:30:00.000Z' }, 'Europe/Madrid');
      expect(d).toContain('«Sacar la basura»');
      expect(d).toContain('9:30');
    });
  });

  describe('herramientas del escritorio', () => {
    const open = TOOL_BY_NAME.get('open_url')!;
    const v = (url: unknown) => open.validate({ url }, NOW);

    it('solo se ofrecen al modelo si el cliente las declara', () => {
      expect(CLIENT_TOOL_NAMES.sort()).toEqual(['open_url', 'read_clipboard']);
      expect(toolDefinitions().map((t) => t.name)).not.toContain('open_url');
      expect(toolDefinitions(['open_url']).map((t) => t.name)).toContain('open_url');
      expect(toolDefinitions(['open_url']).map((t) => t.name)).not.toContain('read_clipboard');
    });

    it('sanitizeClientTools solo acepta nombres conocidos y sin duplicados', () => {
      expect(sanitizeClientTools(['open_url', 'open_url', 'rm_rf', 7, 'read_clipboard'])).toEqual(['open_url', 'read_clipboard']);
      expect(sanitizeClientTools('open_url')).toEqual([]);
      expect(sanitizeClientTools(undefined)).toEqual([]);
    });

    it('open_url acepta http/https públicos y normaliza', () => {
      expect(v('https://es.wikipedia.org/wiki/Axolote')).toEqual({ ok: true, args: { url: 'https://es.wikipedia.org/wiki/Axolote' } });
      expect(v('http://example.com')).toEqual({ ok: true, args: { url: 'http://example.com/' } });
      expect(v('https://8.8.8.8/x').ok).toBe(true);
    });

    it.each([
      ['javascript:alert(1)', 'http o https'],
      ['file:///etc/passwd', 'http o https'],
      ['data:text/html,<h1>x</h1>', 'http o https'],
      ['ftp://example.com', 'http o https'],
      ['https://user:pass@example.com', 'credenciales'],
      ['http://localhost:3000/admin', 'locales'],
      ['http://127.0.0.1:8642/v1', 'locales'],
      ['http://192.168.1.1/', 'locales'],
      ['http://169.254.169.254/latest/meta-data', 'locales'],
      ['http://[::1]/', 'locales'],
      ['https://servidor.local/', 'locales'],
      ['https://intranet/', 'locales'],
      ['noesurl', 'válida'],
      ['https://exa mple.com', 'sin espacios'],
      ['https://example.com/' + 'a'.repeat(2100), 'máx. 2000'],
    ])('open_url rechaza %s', (url, msg) => {
      const r = v(url);
      expect(r.ok).toBe(false);
      expect((r as any).error).toContain(msg);
    });

    it('isBlockedHost cubre nombres internos y rangos privados', () => {
      for (const h of ['localhost', 'a.localhost', 'x.internal', '10.0.0.1', '::1', 'router']) expect(isBlockedHost(h)).toBe(true);
      for (const h of ['example.com', 'es.wikipedia.org', '8.8.8.8']) expect(isBlockedHost(h)).toBe(false);
    });

    it('la tarjeta de open_url muestra la URL completa que se abrirá', () => {
      expect(open.describe!({ url: 'https://example.com/a' }, 'UTC')).toContain('https://example.com/a');
      expect(TOOL_BY_NAME.get('read_clipboard')!.describe!({}, 'UTC')).toContain('portapapeles');
    });
  });

  it('search_memory exige una consulta de texto', () => {
    const s = TOOL_BY_NAME.get('search_memory')!;
    expect(s.validate({}, NOW).ok).toBe(false);
    expect(s.validate({ query: 'a' }, NOW).ok).toBe(false);
    expect(s.validate({ query: 'pesca' }, NOW)).toEqual({ ok: true, args: { query: 'pesca' } });
  });

  it('las herramientas sin argumentos toleran vacío pero no basura', () => {
    const s = TOOL_BY_NAME.get('get_my_status')!;
    expect(s.validate({}, NOW).ok).toBe(true);
    expect(s.validate(undefined, NOW).ok).toBe(true);
    expect(s.validate([1], NOW).ok).toBe(false);
  });

  it('parseToolArguments tolera vacío y devuelve undefined si no es JSON', () => {
    expect(parseToolArguments('')).toEqual({});
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolArguments('{roto')).toBeUndefined();
  });
});
