import * as https from 'https';
import { isIP } from 'net';
import { Readable } from 'stream';

type LookupCallback = (err: NodeJS.ErrnoException | null, address: any, family?: number) => void;

/**
 * Sustituto de dns.lookup que responde siempre con las direcciones ya validadas, sea cual sea el
 * nombre pedido. Evita el DNS rebinding: entre la comprobación SSRF y la conexión no hay una segunda
 * resolución que un atacante pueda cambiar a una IP interna.
 */
export function pinnedLookup(addresses: string[]) {
  const records = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname: string, options: any, cb?: LookupCallback) => {
    const callback = (typeof options === 'function' ? options : cb) as LookupCallback;
    const opts = typeof options === 'object' && options ? options : {};
    const sameFamily = opts.family === 4 || opts.family === 6 ? records.filter((r) => r.family === opts.family) : records;
    const list = sameFamily.length > 0 ? sameFamily : records;
    if (list.length === 0) {
      callback(Object.assign(new Error('Sin direcciones validadas'), { code: 'ENOTFOUND' }), undefined);
    } else if (opts.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  };
}

/**
 * `fetch` mínimo (lo que usa el proveedor de IA) que conecta solo a las IP indicadas. El nombre del
 * host se sigue usando para SNI y para validar el certificado, así que TLS no se debilita.
 * Solo HTTPS, sin seguir redirecciones (un 3xx se devuelve tal cual) y sin compresión.
 */
export function pinnedFetch(addresses: string[]): typeof fetch {
  const lookup = pinnedLookup(addresses);
  return ((input: any, init: RequestInit = {}) =>
    new Promise<Response>((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(String(input));
      } catch (err) {
        return reject(err);
      }
      if (url.protocol !== 'https:') return reject(new Error('Solo se admite HTTPS'));

      const req = https.request(
        url,
        {
          method: init.method ?? 'GET',
          headers: { ...(init.headers as Record<string, string>), 'Accept-Encoding': 'identity' },
          lookup: lookup as any,
          signal: init.signal ?? undefined,
          agent: false, // sin reutilizar conexiones: cada petición pasa por el lookup fijado
        },
        (res) => {
          const status = res.statusCode ?? 502;
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
          }
          const noBody = status === 204 || status === 205 || status === 304;
          if (noBody) res.resume();
          try {
            resolve(new Response(noBody ? null : (Readable.toWeb(res) as any), { status, headers }));
          } catch (err) {
            res.destroy();
            reject(err);
          }
        },
      );
      req.on('error', reject);
      req.end(typeof init.body === 'string' ? init.body : undefined);
    })) as typeof fetch;
}
