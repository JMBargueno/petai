import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { CoopCareService } from './coop-care.service';

describe('PresenceController.getPresence (S-15)', () => {
  const presenceService = { getPresence: jest.fn(() => [{ platform: 'web' }]), hasActiveDevices: jest.fn(() => true) };
  const coopCare = new CoopCareService(new ConfigService({}));
  const build = () => new PresenceController(presenceService as never, coopCare);

  it('permite consultar la propia presencia', async () => {
    await expect(build().getPresence({ id: 'alice' }, 'alice')).resolves.toMatchObject({ userId: 'alice' });
    expect(presenceService.getPresence).toHaveBeenCalledWith('alice');
  });

  it('bloquea la presencia de un tercero que no es amigo', async () => {
    await expect(build().getPresence({ id: 'bob' }, 'carol')).rejects.toThrow(ForbiddenException);
    expect(presenceService.getPresence).not.toHaveBeenCalledWith('carol');
  });

  it('permite la presencia de un amigo aceptado', async () => {
    await coopCare.addFriendship('dana', 'eve'); // eve es amigo aceptado de dana
    await expect(build().getPresence({ id: 'eve' }, 'dana')).resolves.toMatchObject({ userId: 'dana' });
    expect(presenceService.getPresence).toHaveBeenCalledWith('dana');
  });
});