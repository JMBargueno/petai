import { assertSafeBaseUrl, isPrivateAddress, resolveSafeBaseUrl } from './ssrf';
import { pinnedFetch, pinnedLookup } from './pinned-fetch';

describe('ssrf', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1',
    // La misma IPv4 escrita en hexadecimal dentro de una IPv6 (así la normaliza new URL)
    '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:c0a8:101', '::7f00:1', '::', '0:0:0:0:0:ffff:7f00:1',
    '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::1', '2002:7f00:1::1', '2002:a00:1::',
    'fec0::1', 'ff02::1', '2001:db8::1', '2001:0:1::1', '100::1', 'fe80::1%eth0', '[::1]',
    '198.18.0.1', '198.19.255.255', '192.0.2.10', '198.51.100.7', '203.0.113.9', '192.0.0.8', '255.255.255.255',
    'no-es-ip', '1.2.3', '::ffff:1.2.3.999',
  ])('bloquea %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each([
    '8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111', '192.0.66.2', '198.20.0.1',
    '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808', '2002:808:808::1', '2a00:1450:4003:80f::200e',
  ])('permite %s', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));

  it('rechaza http, credenciales y URLs inválidas', async () => {
    await expect(assertSafeBaseUrl('http://api.openai.com/v1')).rejects.toThrow('HTTPS');
    await expect(assertSafeBaseUrl('https://user:pass@api.openai.com/v1')).rejects.toThrow('credenciales');
    await expect(assertSafeBaseUrl('no es url')).rejects.toThrow('válida');
  });

  it('rechaza IPs privadas y loopback literales, incluido IPv6', async () => {
    for (const u of ['https://127.0.0.1/v1', 'https://10.0.0.5/v1', 'https://[::1]/v1', 'https://169.254.169.254/latest']) {
      await expect(assertSafeBaseUrl(u)).rejects.toThrow('privada');
    }
  });

  it('rechaza IPv4 privadas incrustadas en IPv6 tal como las normaliza new URL', async () => {
    for (const u of [
      'https://[::ffff:127.0.0.1]/v1', 'https://[::ffff:169.254.169.254]/latest', 'https://[::ffff:7f00:1]/v1',
      'https://[::127.0.0.1]/v1', 'https://[64:ff9b::10.0.0.1]/v1', 'https://2130706433/v1', 'https://0x7f.1/v1',
    ]) {
      await expect(assertSafeBaseUrl(u)).rejects.toThrow('privada');
    }
  });

  it('devuelve las IP validadas para fijar la conexión', async () => {
    await expect(resolveSafeBaseUrl('https://8.8.8.8/v1/')).resolves.toEqual({ url: 'https://8.8.8.8/v1', addresses: ['8.8.8.8'] });
    await expect(resolveSafeBaseUrl('http://127.0.0.1:1/v1', { allowInsecure: true })).resolves.toEqual({
      url: 'http://127.0.0.1:1/v1', addresses: [] });
  });

  describe('conexión fijada (anti DNS rebinding)', () => {
    const ask = (addrs: string[], options: any) =>
      new Promise<any>((resolve) => pinnedLookup(addrs)('cualquier.host', options, (err, address, family) => resolve({ err, address, family })));

    it('responde siempre con las IP validadas, pida lo que pida el host', async () => {
      expect(await ask(['8.8.8.8'], {})).toMatchObject({ err: null, address: '8.8.8.8', family: 4 });
      expect(await ask(['8.8.8.8', '2606:4700:4700::1111'], { all: true })).toMatchObject({
        address: [{ address: '8.8.8.8', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }] });
      expect(await ask(['8.8.8.8', '2606:4700:4700::1111'], { family: 6 })).toMatchObject({ address: '2606:4700:4700::1111', family: 6 });
      expect((await ask([], {})).err).toBeTruthy();
    });

    it('solo admite HTTPS', async () => {
      await expect(pinnedFetch(['8.8.8.8'])('http://example.com/v1')).rejects.toThrow('HTTPS');
    });
  });

  it('rechaza hosts que no resuelven', async () => {
    await expect(assertSafeBaseUrl('https://no-existe.invalid/v1')).rejects.toThrow('privada o no resoluble');
  });

  it('acepta una IP pública y normaliza la barra final', async () => {
    await expect(assertSafeBaseUrl('https://8.8.8.8/v1/')).resolves.toBe('https://8.8.8.8/v1');
  });

  it('con allowInsecure permite http/loopback (solo desarrollo)', async () => {
    await expect(assertSafeBaseUrl('http://127.0.0.1:8642/v1', { allowInsecure: true })).resolves.toBe(
      'http://127.0.0.1:8642/v1');
    await expect(assertSafeBaseUrl('ftp://x/v1', { allowInsecure: true })).rejects.toThrow('Protocolo');
  });
});
