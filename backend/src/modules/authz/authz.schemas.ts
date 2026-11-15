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

// Listado de mascotas para administración: paginación + filtros opcionales (rarity, q por
// nickname o datos del dueño). El renombre de nickname se valida con el helper compartido
// (common/pet-name), no aquí, para compartir la misma regla 1-16 que la eclosión.
export const listPetsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  rarity: z.string().trim().min(1).max(32).optional(),
  q: z.string().trim().max(100).optional(),
});
