import { ForbiddenException } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * PresenceController.getPresence (S-15): la presencia es privada; solo el propio usuario o un amigo
 * aceptado la pueden consultar. Se prueba decoplando la lógica de amistad (mock de
 * `checkFriendship`) de la implementación Prisma de `CoopCareService`.
 */
describe('PresenceController.getPresence (S-15)', () => {
  const presenceService = {
    getPresence: jest.fn(() => [{ platform: 'web' }]),
    hasActiveDevices: jest.fn(() => true),
  };
  const checkFriendship = jest.fn();
  const build = () => new PresenceController(presenceService as never, { checkFriendship } as never);

  afterEach(() => jest.clearAllMocks());

  it('permite consultar la propia presencia (sin comprobar amistad)', async () => {
    await expect(build().getPresence({ id: 'alice' }, 'alice')).resolves.toMatchObject({ userId: 'alice' });
    expect(presenceService.getPresence).toHaveBeenCalledWith('alice');
    expect(checkFriendship).not.toHaveBeenCalled();
  });

  it('bloquea la presencia de un tercero que no es amigo', async () => {
    checkFriendship.mockResolvedValue(false);
    await expect(build().getPresence({ id: 'bob' }, 'carol')).rejects.toThrow(ForbiddenException);
    expect(presenceService.getPresence).not.toHaveBeenCalledWith('carol');
  });

  it('permite la presencia de un amigo aceptado', async () => {
    checkFriendship.mockResolvedValue(true);
    await expect(build().getPresence({ id: 'eve' }, 'dana')).resolves.toMatchObject({ userId: 'dana' });
    expect(presenceService.getPresence).toHaveBeenCalledWith('dana');
  });
});