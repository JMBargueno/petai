import { assertSafeBaseUrl, isPrivateAddress } from './ssrf';

describe('ssrf', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '0.0.0.0', '100.64.0.1', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:127.0.0.1',
  ])('bloquea %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('permite %s', (ip) =>
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
