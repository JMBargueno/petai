import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DesktopUpdatesService, compareVersions } from './desktop-updates.service';

const RELEASE = {
  assets: [
    { id: 1, name: 'latest.json', url: 'https://api.github.com/repos/o/r/releases/assets/1' },
    { id: 2, name: 'Pockai_0.2.0_x64-setup.exe', url: 'https://api.github.com/repos/o/r/releases/assets/2' },
    { id: 3, name: 'Pockai_0.2.0_x64.dmg', url: 'https://api.github.com/repos/o/r/releases/assets/3' },
    { id: 4, name: 'Pockai_0.2.0_aarch64.dmg', url: 'https://api.github.com/repos/o/r/releases/assets/4' },
    { id: 5, name: 'Pockai_0.2.0_x64-setup.exe.sig', url: 'https://api.github.com/repos/o/r/releases/assets/5' },
  ],
};

const LATEST = {
  version: '0.2.0',
  notes: 'Novedades',
  pub_date: '2026-11-15T00:00:00Z',
  platforms: {
    'windows-x86_64': {
      signature: 'SIG',
      url: 'https://github.com/o/r/releases/download/v0.2.0/Pockai_0.2.0_x64-setup.exe',
    },
  },
};

function makeService(token: string | undefined = 'tok', realtime?: any) {
  const config = { get: (k: string) => (k === 'GITHUB_RELEASES_TOKEN' ? token : undefined) } as unknown as ConfigService;
  return new DesktopUpdatesService(config, realtime);
}

function mockFetch() {
  const fn = jest.fn(async (url: string) => {
    if (url.endsWith('/releases/latest')) return new Response(JSON.stringify(RELEASE), { status: 200 });
    if (url.endsWith('/assets/1')) return new Response(JSON.stringify(LATEST), { status: 200 });
    if (url.endsWith('/assets/2')) {
      return new Response(null, { status: 302, headers: { location: 'https://objects.github/signed' } });
    }
    return new Response('nope', { status: 404 });
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('compareVersions', () => {
  it('ordena versiones semver', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('v1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
  });
});

describe('DesktopUpdatesService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sin token no ofrece actualización ni llama a GitHub', async () => {
    const fn = mockFetch();
    await expect(makeService('').findUpdate('windows', 'x86_64', '0.1.0')).resolves.toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it('devuelve el manifest si hay una versión más nueva', async () => {
    mockFetch();
    await expect(makeService().findUpdate('windows', 'x86_64', '0.1.0')).resolves.toEqual({
      version: '0.2.0',
      notes: 'Novedades',
      pub_date: '2026-11-15T00:00:00Z',
      signature: 'SIG',
      assetId: 2,
    });
  });

  it('no ofrece actualización si la versión es igual o mayor', async () => {
    mockFetch();
    const svc = makeService();
    await expect(svc.findUpdate('windows', 'x86_64', '0.2.0')).resolves.toBeNull();
    await expect(svc.findUpdate('windows', 'x86_64', '0.3.0')).resolves.toBeNull();
  });

  it('no ofrece actualización para una plataforma sin binario', async () => {
    mockFetch();
    await expect(makeService().findUpdate('darwin', 'aarch64', '0.1.0')).resolves.toBeNull();
  });

  it('cachea el release entre consultas', async () => {
    const fn = mockFetch();
    const svc = makeService();
    await svc.findUpdate('windows', 'x86_64', '0.1.0');
    await svc.findUpdate('windows', 'x86_64', '0.1.0');
    expect(fn).toHaveBeenCalledTimes(2); // releases/latest + latest.json, una sola vez
  });

  it('redirige la descarga a la URL firmada de GitHub', async () => {
    mockFetch();
    await expect(makeService().getDownloadUrl(2)).resolves.toBe('https://objects.github/signed');
  });

  it('rechaza assets que no son del release actual', async () => {
    mockFetch();
    await expect(makeService().getDownloadUrl(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('localiza el instalador de cada plataforma para el enlace de la web', async () => {
    mockFetch();
    const svc = makeService();
    await expect(svc.findInstallerAssetId('windows')).resolves.toBe(2); // no el .sig
    await expect(svc.findInstallerAssetId('macos')).resolves.toBe(4); // Apple Silicon primero
  });

  it('404 en el enlace de la web si no hay token o release', async () => {
    mockFetch();
    await expect(makeService('').findInstallerAssetId('windows')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('degrada a null si GitHub falla', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    await expect(makeService().findUpdate('windows', 'x86_64', '0.1.0')).resolves.toBeNull();
  });

  it('notifica por websocket al detectar una versión nueva', async () => {
    mockFetch();
    const emitUpdateMock = jest.fn();
    const realtimeMock = { emitDesktopUpdateAvailable: emitUpdateMock };
    const svc = makeService('tok', realtimeMock);

    await svc.findUpdate('windows', 'x86_64', '0.1.0');
    expect(emitUpdateMock).toHaveBeenCalledWith('0.2.0', 'Novedades');
  });
});
