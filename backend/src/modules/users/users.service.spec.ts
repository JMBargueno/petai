import { UsersService } from './users.service';

/** B1: al fijar el nickname se sustituye el nombre heredado del correo (dato privado). */
describe('UsersService.setHandle — nombre heredado del correo', () => {
  function build(current: { email: string; displayName: string | null }) {
    const prisma: any = {
      user: {
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({})),
        findUnique: jest.fn(async (q: any) => (q?.select?.email ? current : { id: 'u1' })),
      },
    };
    const service = new UsersService(prisma as never, { emit: jest.fn() } as never);
    jest.spyOn(service, 'getMe').mockResolvedValue({} as never);
    return { service, prisma };
  }

  it('sustituye un nombre igual a la parte local del correo', async () => {
    const { service, prisma } = build({ email: 'ana.garcia@example.com', displayName: 'ana.garcia' });
    await service.setHandle('u1', { handle: 'astro_ana' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { displayName: 'astro_ana' } });
  });

  it('sustituye el nombre genérico por defecto', async () => {
    const { service, prisma } = build({ email: 'ana.garcia@example.com', displayName: 'Entrenador' });
    await service.setHandle('u1', { handle: 'astro_ana' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { displayName: 'astro_ana' } });
  });

  it('no toca un nombre que eligió el jugador', async () => {
    const { service, prisma } = build({ email: 'ana.garcia@example.com', displayName: 'Ana' });
    await service.setHandle('u1', { handle: 'astro_ana' });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
