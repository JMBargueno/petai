import { hasPermission, PERMISSIONS } from './permissions';
import { ROLES } from './roles';

describe('hasPermission', () => {
  it('superadmin tiene todos los permisos', () => {
    for (const p of PERMISSIONS) expect(hasPermission('superadmin', p)).toBe(true);
  });

  it.each(ROLES.filter((r) => r !== 'superadmin'))('%s aún no tiene permisos', (role) => {
    for (const p of PERMISSIONS) expect(hasPermission(role, p)).toBe(false);
  });

  it('un rol desconocido o ausente se trata como user', () => {
    expect(hasPermission('root', 'users:read')).toBe(false);
    expect(hasPermission(undefined, 'users:read')).toBe(false);
  });
});
