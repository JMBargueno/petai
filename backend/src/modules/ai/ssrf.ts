import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

function isPrivateV4(bytes: number[]): boolean {
  const [a, b, c] = bytes;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / metadata cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // asignaciones IETF y TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // relé 6to4
    (a === 198 && (b === 18 || b === 19)) || // pruebas de rendimiento
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast y reservado
  );
}

/** IPv6 textual → 16 bytes (admite `::` y una IPv4 con puntos al final); null si no es válida. */
function parseV6(text: string): number[] | null {
  let s = text;
  const tail: number[] = [];
  const dotted = s.match(/(^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (isIP(dotted[2]) !== 4) return null;
    tail.push(...dotted[2].split('.').map(Number));
    s = s.slice(0, s.length - dotted[2].length);
    if (s.endsWith('::')) s = s.slice(0, -1);
    else if (s.endsWith(':')) s = s.slice(0, -1);
    else return null;
    if (s === '') return null;
  }
  const groups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      const n = parseInt(g, 16);
      out.push(n >> 8, n & 0xff);
    }
    return out;
  };
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = groups(s === ':' ? '' : halves[0]);
  const rest = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !rest) return null;
  const known = head.length + rest.length + tail.length;
  if (halves.length === 2 || s === ':') {
    if (known > 16) return null;
    return [...head, ...new Array(16 - known).fill(0), ...rest, ...tail];
  }
  return known === 16 ? [...head, ...tail] : null;
}

function isPrivateV6(b: number[]): boolean {
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);

  // Direcciones que llevan una IPv4 dentro: se juzga la IPv4 (así ::ffff:7f00:1 es loopback)
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return isPrivateV4(b.slice(12)); // ::ffff:0:0/96 (mapeada)
  if (zero(0, 12)) return isPrivateV4(b.slice(12)); // ::/96 (compatible; incluye :: y ::1)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return zero(4, 12) ? isPrivateV4(b.slice(12)) : true; // 64:ff9b::/96 (NAT64) y 64:ff9b:1::/48 (local)
  }
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateV4(b.slice(2, 6)); // 2002::/16 (6to4)

  return (
    (b[0] & 0xfe) === 0xfc || // fc00::/7 (ULA)
    (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) || // fe80::/10 (link-local)
    (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) || // fec0::/10 (site-local, obsoleto)
    b[0] === 0xff || // multicast
    (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) || // 2001:db8::/32 (documentación)
    (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) || // 2001::/32 (Teredo)
    (b[0] === 0x01 && b[1] === 0x00 && zero(2, 8)) // 100::/64 (descarte)
  );
}

/**
 * ¿La IP pertenece a un rango privado, loopback, link-local o reservado? Se decide sobre los bytes
 * de la dirección y no sobre su texto: una misma IP se puede escribir de muchas formas
 * (::ffff:127.0.0.1 ≡ ::ffff:7f00:1) y todas deben recibir la misma respuesta.
 */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, ''); // sin corchetes ni zona
  if (isIP(v) === 4) return isPrivateV4(v.split('.').map(Number));
  if (isIP(v) === 6) {
    const bytes = parseV6(v);
    return bytes ? isPrivateV6(bytes) : true;
  }
  return true; // si no se reconoce, se trata como no seguro
}

export interface UrlPolicy {
  /** Solo para desarrollo/tests: permite http y destinos privados/loopback. */
  allowInsecure?: boolean;
}

export interface SafeBaseUrl {
  /** URL normalizada (sin barra final). */
  url: string;
  /**
   * Direcciones IP ya validadas a las que debe conectarse quien haga la petición (ver pinned-fetch).
   * Vacío con `allowInsecure`: en desarrollo no se fija el destino.
   */
  addresses: string[];
}

/**
 * Valida la baseUrl proporcionada por el usuario antes de que el servidor haga
 * peticiones salientes (SSRF): solo HTTPS, sin credenciales en la URL y sin
 * resolver a rangos privados. Devuelve además las IP comprobadas, para que la conexión
 * se haga exactamente a ellas y un cambio de DNS posterior (rebinding) no la desvíe.
 */
export async function resolveSafeBaseUrl(raw: string, policy: UrlPolicy = {}): Promise<SafeBaseUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('baseUrl no es una URL válida');
  }

  if (url.username || url.password) {
    throw new BadRequestException('La baseUrl no puede incluir credenciales');
  }

  let addresses: string[] = [];
  if (!policy.allowInsecure) {
    if (url.protocol !== 'https:') {
      throw new BadRequestException('La baseUrl debe usar HTTPS');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    addresses = isIP(host) ? [host] : await resolveAll(host);
    if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
      throw new BadRequestException(
        'La baseUrl apunta a una dirección privada o no resoluble; no está permitida',
      );
    }
  } else if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Protocolo no soportado');
  }

  return { url: url.toString().replace(/\/+$/, ''), addresses };
}

/** Igual que resolveSafeBaseUrl, pero devuelve solo la URL normalizada. */
export async function assertSafeBaseUrl(raw: string, policy: UrlPolicy = {}): Promise<string> {
  return (await resolveSafeBaseUrl(raw, policy)).url;
}

async function resolveAll(host: string): Promise<string[]> {
  try {
    return (await lookup(host, { all: true })).map((r) => r.address);
  } catch {
    return [];
  }
}
