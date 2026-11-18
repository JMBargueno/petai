import { createSign, generateKeyPairSync } from 'crypto';
import { GooglePlayClient } from './google-play.client';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'RS256', use: 'sig' };

const b64url = (v: Buffer | string) =>
  Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function token(payload: Record<string, unknown>, kid = 'kid-1', key = privateKey) {
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', kid }))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  return `Bearer ${unsigned}.${b64url(signer.sign(key))}`;
}

describe('GooglePlayClient.verifyPubSubToken', () => {
  const env: Record<string, string> = {
    GOOGLE_RTDN_AUDIENCE: 'https://api.pockai.world/billing/google/rtdn',
    GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: 'rtdn@pockai.iam.gserviceaccount.com',
  };
  let client: GooglePlayClient;
  const now = Math.floor(Date.now() / 1000);
  const valid = {
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_RTDN_AUDIENCE,
    email: env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL,
    email_verified: true,
    iat: now,
    exp: now + 3600,
  };

  beforeEach(() => {
    client = new GooglePlayClient({ get: (k: string) => env[k] } as any);
    client.fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ keys: [jwk] }) })) as any;
  });

  it('acepta un JWT válido de la cuenta de servicio configurada', async () => {
    expect(await client.verifyPubSubToken(token(valid))).toBe(true);
  });

  it('rechaza peticiones sin Authorization', async () => {
    expect(await client.verifyPubSubToken(undefined)).toBe(false);
  });

  it('rechaza una firma de otra clave', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(await client.verifyPubSubToken(token(valid, 'kid-1', other))).toBe(false);
  });

  it.each([
    ['audiencia', { aud: 'https://otro' }],
    ['cuenta de servicio', { email: 'atacante@evil.iam.gserviceaccount.com' }],
    ['emisor', { iss: 'https://evil.example' }],
    ['caducidad', { exp: now - 3600 }],
    ['email no verificado', { email_verified: false }],
  ])('rechaza un JWT con %s incorrecta', async (_label, override) => {
    expect(await client.verifyPubSubToken(token({ ...valid, ...override }))).toBe(false);
  });
});
