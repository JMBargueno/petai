import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendStatus } from './backend-status';
import { RETRY_MIN_MS, SITE_CONFIG_KEY, SiteConfigService, normalize } from './site-config';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const MAINTENANCE_ON = {
  inviteRequired: false,
  comingSoon: { enabled: false, countdown: { enabled: false, launchAt: null } },
  maintenance: { enabled: true, scope: 'web', message: { es: 'Volvemos a las 18:00', en: '' } },
};

describe('SiteConfigService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.removeItem(SITE_CONFIG_KEY);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('lee la configuración, la normaliza, la guarda y se identifica como web', async () => {
    fetchMock.mockResolvedValue(json(MAINTENANCE_ON));
    const site = TestBed.inject(SiteConfigService);
    await site.load();
    expect(site.backendDown()).toBe(false);
    expect(site.config().maintenance).toEqual({ enabled: true, scope: 'web', message: { es: 'Volvemos a las 18:00', en: null } });
    expect(JSON.parse(localStorage.getItem(SITE_CONFIG_KEY)!).maintenance.enabled).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Client']).toBe('web');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sin red: backend caído y se conserva la copia local', async () => {
    localStorage.setItem(SITE_CONFIG_KEY, JSON.stringify({ inviteRequired: true }));
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const site = TestBed.inject(SiteConfigService);
    await site.load();
    expect(site.backendDown()).toBe(true);
    expect(site.config().inviteRequired).toBe(true);
    expect(site.loaded()).toBe(true);
  });

  it('un 502/503 del CDN también cuenta como caído; un 4xx no', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    const site = TestBed.inject(SiteConfigService);
    await site.load();
    expect(site.backendDown()).toBe(true);

    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }));
    await site.load(true);
    expect(site.backendDown()).toBe(false);
  });

  it('se recupera solo: reintenta y, cuando el backend vuelve, deja de estar caído', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const site = TestBed.inject(SiteConfigService);
    await site.load();
    expect(site.backendDown()).toBe(true);

    fetchMock.mockResolvedValue(json({}));
    await vi.advanceTimersByTimeAsync(RETRY_MIN_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(site.backendDown()).toBe(false);
  });

  it('una llamada a la API que no llega al servidor dispara una nueva comprobación', async () => {
    fetchMock.mockResolvedValue(json({}));
    const site = TestBed.inject(SiteConfigService);
    await site.load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    TestBed.inject(BackendStatus).report('offline');
    await vi.waitFor(() => expect(site.backendDown()).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('normalize', () => {
  it('rellena lo que falte con valores seguros', () => {
    expect(normalize(null).maintenance).toEqual({ enabled: false, scope: 'all', message: { es: null, en: null } });
    expect(normalize({ maintenance: { enabled: 1, scope: 'raro', message: { es: '  ' } } }).maintenance).toEqual({
      enabled: true,
      scope: 'all',
      message: { es: null, en: null },
    });
  });
});
