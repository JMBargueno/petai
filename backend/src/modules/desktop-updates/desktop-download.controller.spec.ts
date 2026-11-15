import { Test } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import * as request from 'supertest';
import { DesktopDownloadController } from './desktop-download.controller';
import { DesktopUpdatesService } from './desktop-updates.service';

describe('DesktopDownloadController (unit)', () => {
  let app: INestApplication;
  const service = {
    findInstallerAssetId: jest.fn(),
    getDownloadUrl: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [DesktopDownloadController],
      providers: [{ provide: DesktopUpdatesService, useValue: service }],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.resetAllMocks());

  const api = () => request(app.getHttpServer());

  it('redirige al instalador más reciente', async () => {
    service.findInstallerAssetId.mockResolvedValue(2);
    service.getDownloadUrl.mockResolvedValue('https://objects.github/setup.exe');
    const res = await api().get('/v1/desktop/download/windows').expect(302);
    expect(res.headers.location).toBe('https://objects.github/setup.exe');
    expect(service.findInstallerAssetId).toHaveBeenCalledWith('windows');
    expect(service.getDownloadUrl).toHaveBeenCalledWith(2);
  });

  it('404 para plataformas desconocidas', async () => {
    await api().get('/v1/desktop/download/linux').expect(404);
    expect(service.findInstallerAssetId).not.toHaveBeenCalled();
  });

  it('404 si no hay instalador publicado', async () => {
    service.findInstallerAssetId.mockRejectedValue(new NotFoundException());
    await api().get('/v1/desktop/download/macos').expect(404);
  });
});
