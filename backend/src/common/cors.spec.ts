import { DEFAULT_CORS_ORIGINS, isOriginAllowed, parseOrigins, socketCorsOrigin } from './cors';

describe('cors', () => {
  it('parseOrigins separa por comas, recorta espacios y barras finales y usa los valores por defecto', () => {
    expect(parseOrigins(' https://a.com/ , http://b.io:8080 ,, ')).toEqual(['https://a.com', 'http://b.io:8080']);
    expect(parseOrigins(undefined)).toEqual(DEFAULT_CORS_ORIGINS.split(','));
    expect(parseOrigins('')).toEqual([]);
  });

  it('por defecto admite Vite y el webview de Tauri en cada plataforma', () => {
    const allowed = parseOrigins();
    for (const o of ['http://localhost:5173', 'http://127.0.0.1:5173', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
      expect(isOriginAllowed(o, allowed)).toBe(true);
    }
  });

  it('rechaza cualquier otro origen de navegador', () => {
    const allowed = parseOrigins();
    for (const o of ['https://evil.example', 'http://localhost:5174', 'http://localhost', 'null', 'http://localhost:5173.evil.com']) {
      expect(isOriginAllowed(o, allowed)).toBe(false);
    }
  });

  it('las peticiones sin Origin (curl, apps nativas) no son de navegador y se aceptan', () => {
    expect(isOriginAllowed(undefined, parseOrigins())).toBe(true);
  });

  it('tolera la barra final del origen recibido', () => {
    expect(isOriginAllowed('https://a.com/', ['https://a.com'])).toBe(true);
  });

  it('socketCorsOrigin lee CORS_ORIGINS del entorno en cada conexión', () => {
    const previous = process.env.CORS_ORIGINS;
    try {
      process.env.CORS_ORIGINS = 'https://app.example.com';
      const cb = jest.fn();
      socketCorsOrigin('https://app.example.com', cb);
      socketCorsOrigin('https://evil.example', cb);
      expect(cb.mock.calls).toEqual([[null, true], [null, false]]);
    } finally {
      if (previous === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previous;
    }
  });
});
