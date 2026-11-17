import { BadRequestException } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';

function buildService(row: Record<string, unknown> | null = null) {
  const prismaMock: any = {
    appSettings: {
      findUnique: jest.fn(async () => row),
      upsert: jest.fn(async () => ({})),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
  };
  return { service: new SiteSettingsService(prismaMock as never), prismaMock };
}

describe('SiteSettingsService', () => {
  it('sin fila de ajustes: web abierta y registro libre', async () => {
    const { service } = buildService(null);
    expect(await service.getPublicConfig()).toEqual({
      inviteRequired: false,
      comingSoon: { enabled: false, countdown: { enabled: false, launchAt: null } },
      maintenance: { enabled: false, scope: 'all', message: { es: null, en: null } },
    });
    expect(await service.getSettings()).toEqual({
      comingSoonEnabled: false,
      comingSoonCountdownEnabled: false,
      comingSoonLaunchAt: null,
      maintenanceEnabled: false,
      maintenanceScope: 'all',
      maintenanceMessageEs: null,
      maintenanceMessageEn: null,
    });
  });

  it('la config pública refleja la fila', async () => {
    const launchAt = new Date('2027-01-01T10:00:00Z');
    const { service } = buildService({
      registrationInviteOnly: true,
      comingSoonEnabled: true,
      comingSoonCountdownEnabled: true,
      comingSoonLaunchAt: launchAt,
      maintenanceEnabled: true,
      maintenanceScope: 'web',
      maintenanceMessageEs: 'Volvemos pronto',
      maintenanceMessageEn: null,
    });
    expect(await service.getPublicConfig()).toEqual({
      inviteRequired: true,
      comingSoon: { enabled: true, countdown: { enabled: true, launchAt: launchAt.toISOString() } },
      maintenance: { enabled: true, scope: 'web', message: { es: 'Volvemos pronto', en: null } },
    });
  });

  it('un cambio parcial solo toca los campos enviados y queda auditado', async () => {
    const { service, prismaMock } = buildService(null);
    await service.setSettings({ id: 'admin-1' }, { comingSoonEnabled: true });
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, comingSoonEnabled: true },
      update: { comingSoonEnabled: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'admin-1', event: 'site_settings_change' }) }),
    );
  });

  it('acepta quitar la fecha y rechaza tipos incorrectos o campos desconocidos', async () => {
    const { service, prismaMock } = buildService(null);
    await service.setSettings({ id: 'a' }, { comingSoonLaunchAt: null });
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { comingSoonLaunchAt: null } }));
    await expect(service.setSettings({ id: 'a' }, { comingSoonEnabled: 'sí' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setSettings({ id: 'a' }, { otro: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('valida el mantenimiento: alcance conocido, mensajes recortados y con tope', async () => {
    const { service, prismaMock } = buildService(null);
    await service.setSettings(
      { id: 'a' },
      { maintenanceEnabled: true, maintenanceScope: 'apps', maintenanceMessageEs: '  Hola  ', maintenanceMessageEn: '   ' },
    );
    expect(prismaMock.appSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { maintenanceEnabled: true, maintenanceScope: 'apps', maintenanceMessageEs: 'Hola', maintenanceMessageEn: null },
      }),
    );
    await expect(service.setSettings({ id: 'a' }, { maintenanceScope: 'todo' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setSettings({ id: 'a' }, { maintenanceMessageEs: 'x'.repeat(1001) })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('el estado del mantenimiento se cachea y un cambio lo invalida', async () => {
    const { service, prismaMock } = buildService({ maintenanceEnabled: true, maintenanceScope: 'all' });
    await service.getMaintenance();
    await service.getMaintenance();
    expect(prismaMock.appSettings.findUnique).toHaveBeenCalledTimes(1);
    // Tras un cambio se vuelve a leer la fila (no se sirve la copia anterior).
    prismaMock.appSettings.findUnique.mockResolvedValue({ maintenanceEnabled: false, maintenanceScope: 'all' });
    await service.setSettings({ id: 'a' }, { maintenanceEnabled: false });
    expect((await service.getMaintenance()).enabled).toBe(false);
  });

  it('un alcance desconocido en la fila se trata como todo', async () => {
    const { service } = buildService({ maintenanceEnabled: true, maintenanceScope: 'raro' });
    expect((await service.getMaintenance()).scope).toBe('all');
  });
});
