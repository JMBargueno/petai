import { z } from 'zod';
import { ROLES } from './roles';

export const assignRoleSchema = z.object({
  role: z.enum(ROLES, { message: `Rol no válido (${ROLES.join(' | ')})` }),
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(ROLES).optional(),
  q: z.string().trim().max(100).optional(),
});
