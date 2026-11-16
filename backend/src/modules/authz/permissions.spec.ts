import { hasPermission, permissionsFor, PERMISSIONS } from './permissions';

describe('hasPermission', () => {
  it('superadmin tiene todos los permisos', () => {
    for (const p of PERMISSIONS) expect(hasPermission('superadmin', p)).toBe(true);
  });

  it('admin gestiona el juego pero no edita usuarios a mano', () => {
    for (const p of ['admin:access', 'users:read', 'users:role:assign', 'economy:manage', 'events:manage', 'audit:read', 'pets:read', 'pets:rename', 'invites:manage'] as const) {
      expect(hasPermission('admin', p)).toBe(true);
    }
    expect(hasPermission('admin', 'users:update')).toBe(false);
    expect(hasPermission('admin', 'billing:manage')).toBe(false);
  });

  it('moderator solo consulta y modera', () => {
    expect(permissionsFor('moderator').sort()).toEqual(['admin:access', 'audit:read', 'mods:moderate', 'pets:read', 'users:read']);
    expect(hasPermission('moderator', 'billing:manage')).toBe(false);
  });

  it('user no tiene permisos', () => {
    for (const p of PERMISSIONS) expect(hasPermission('user', p)).toBe(false);
  });

  it('un rol desconocido o ausente se trata como user', () => {
    expect(hasPermission('root', 'users:read')).toBe(false);
    expect(hasPermission(undefined, 'users:read')).toBe(false);
  });
});
