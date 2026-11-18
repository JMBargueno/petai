import { Test } from '@nestjs/testing';
import { ExecutionContext, INestApplication, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import { DesktopDownloadController } from './desktop-download.controller';
import { DesktopUpdatesService } from './desktop-updates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** Usuario que inyecta el guard falso según la cabecera `x-test-user` (none | unverified | verified). */
const fakeGuard = {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const who = req.headers['x-test-user'];
    if (!who || who === 'none') throw new UnauthorizedException();
    req.user = { id: 'u1', emailVerifiedAt: who === 'verified' ? new Date() : null };
    return true;
  },
};

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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeGuard)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => jest.resetAllMocks());

  const api = () => request(app.getHttpServer());

  it('401 sin sesión', async () => {
    await api().get('/v1/desktop/download/windows').expect(401);
    expect(service.findInstallerAssetId).not.toHaveBeenCalled();
  });

  it('403 EMAIL_NOT_VERIFIED con el correo sin verificar', async () => {
    const res = await api().get('/v1/desktop/download/windows').set('x-test-user', 'unverified').expect(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(service.findInstallerAssetId).not.toHaveBeenCalled();
  });

  it('devuelve la URL del instalador más reciente a una cuenta verificada', async () => {
    service.findInstallerAssetId.mockResolvedValue(2);
    service.getDownloadUrl.mockResolvedValue('https://objects.github/setup.exe');
    const res = await api().get('/v1/desktop/download/windows').set('x-test-user', 'verified').expect(200);
    expect(res.body).toEqual({ url: 'https://objects.github/setup.exe' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(service.findInstallerAssetId).toHaveBeenCalledWith('windows');
    expect(service.getDownloadUrl).toHaveBeenCalledWith(2);
  });

  it('404 para plataformas desconocidas', async () => {
    await api().get('/v1/desktop/download/linux').set('x-test-user', 'verified').expect(404);
    expect(service.findInstallerAssetId).not.toHaveBeenCalled();
  });

  it('404 si no hay instalador publicado', async () => {
    service.findInstallerAssetId.mockRejectedValue(new NotFoundException());
    await api().get('/v1/desktop/download/macos').set('x-test-user', 'verified').expect(404);
  });
});
