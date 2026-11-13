import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** ¿La IP pertenece a un rango privado, loopback, link-local o reservado? */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();

  // IPv4 mapeada en IPv6 (::ffff:10.0.0.1)
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);

  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / metadata cloud
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224 // multicast y reservado
    );
  }

  if (isIP(v) === 6) {
    return (
      v === '::' ||
      v === '::1' ||
      v.startsWith('fc') ||
      v.startsWith('fd') || // fc00::/7
      /^fe[89ab]/.test(v) || // fe80::/10
      v.startsWith('ff') // multicast
    );
  }
  return true; // si no se reconoce, se trata como no seguro
}

export interface UrlPolicy {
  /** Solo para desarrollo/tests: permite http y destinos privados/loopback. */
  allowInsecure?: boolean;
}

/**
 * Valida la baseUrl proporcionada por el usuario antes de que el servidor haga
 * peticiones salientes (SSRF): solo HTTPS, sin credenciales en la URL y sin
 * resolver a rangos privados. Devuelve la URL normalizada (sin barra final).
 */
export async function assertSafeBaseUrl(raw: string, policy: UrlPolicy = {}): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('baseUrl no es una URL válida');
  }

  if (url.username || url.password) {
    throw new BadRequestException('La baseUrl no puede incluir credenciales');
  }

  if (!policy.allowInsecure) {
    if (url.protocol !== 'https:') {
      throw new BadRequestException('La baseUrl debe usar HTTPS');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : (await resolveAll(host));
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new BadRequestException(
        'La baseUrl apunta a una dirección privada o no resoluble; no está permitida',
      );
    }
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Protocolo no soportado');
  }

  return url.toString().replace(/\/+$/, '');
}

async function resolveAll(host: string): Promise<string[]> {
  try {
    return (await lookup(host, { all: true })).map((r) => r.address);
  } catch {
    return [];
  }
}
