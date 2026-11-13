import { KeyCryptoService } from './key-crypto.service';

const cfg = (key?: string) => ({ get: () => key }) as any;
const KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('KeyCryptoService', () => {
  const svc = new KeyCryptoService(cfg(KEY));

  it('cifra y descifra (ida y vuelta)', () => {
    const enc = svc.encrypt('sk-test-1234567890');
    expect(enc.encryptedKey).not.toContain('sk-test');
    expect(svc.decrypt(enc)).toBe('sk-test-1234567890');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(svc.encrypt('abc12345').keyIv).not.toBe(svc.encrypt('abc12345').keyIv);
  });

  it('detecta manipulación del texto cifrado o del tag (GCM)', () => {
    const enc = svc.encrypt('sk-test-1234567890');
    const flipped = Buffer.from(enc.encryptedKey, 'base64');
    flipped[0] ^= 1;
    expect(() => svc.decrypt({ ...enc, encryptedKey: flipped.toString('base64') })).toThrow();
    const tag = Buffer.from(enc.keyTag, 'base64');
    tag[0] ^= 1;
    expect(() => svc.decrypt({ ...enc, keyTag: tag.toString('base64') })).toThrow();
  });

  it('no descifra con otra clave maestra', () => {
    const enc = svc.encrypt('sk-test-1234567890');
    const other = new KeyCryptoService(cfg('f'.repeat(64)));
    expect(() => other.decrypt(enc)).toThrow();
  });

  it('rechaza una clave maestra mal formada', () => {
    expect(() => new KeyCryptoService(cfg('corta')).encrypt('x')).toThrow('64 caracteres');
  });

  it('enmascara la key', () => {
    expect(KeyCryptoService.mask('sk-abcdefghijkl1234')).toBe('sk-…1234');
    expect(KeyCryptoService.mask('abc')).toBe('••••');
  });
});
