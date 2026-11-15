import { Test } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';
import { DesktopUpdatesController } from './desktop-updates.controller';
import { DesktopUpdatesService } from './desktop-updates.service';

describe('DesktopUpdatesController (unit)', () => {
  let app: INestApplication;
  const service = {
    findUpdate: jest.fn(),
    getDownloadUrl: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [DesktopUpdatesController],
      providers: [{ provide: DesktopUpdatesService, useValue: service }],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.resetAllMocks());

  const api = () => request(app.getHttpServer());

  it('responde 204 si no hay actualización', async () => {
    service.findUpdate.mockResolvedValue(null);
    await api().get('/v1/desktop/updates/windows/x86_64/0.1.0').expect(204);
    expect(service.findUpdate).toHaveBeenCalledWith('windows', 'x86_64', '0.1.0');
  });

  it('responde 200 con el formato del updater y la URL de descarga del backend', async () => {
    service.findUpdate.mockResolvedValue({ version: '0.2.0', notes: 'n', signature: 'SIG', assetId: 42 });
    const res = await api().get('/v1/desktop/updates/windows/x86_64/0.1.0').set('Host', 'api.example.com').expect(200);
    expect(res.body).toEqual({
      version: '0.2.0',
      notes: 'n',
      signature: 'SIG',
      url: 'http://api.example.com/v1/desktop/updates/download/42',
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('redirige la descarga con 302', async () => {
    service.getDownloadUrl.mockResolvedValue('https://objects.github/signed');
    const res = await api().get('/v1/desktop/updates/download/42').expect(302);
    expect(res.headers.location).toBe('https://objects.github/signed');
    expect(service.getDownloadUrl).toHaveBeenCalledWith(42);
  });

  it('404 si el asset no es del release actual; 400 si el id no es numérico', async () => {
    service.getDownloadUrl.mockRejectedValue(new NotFoundException());
    await api().get('/v1/desktop/updates/download/7').expect(404);
    await api().get('/v1/desktop/updates/download/abc').expect(400);
  });
});
