/**
 * Pockai activo de cada jugador: el que eligió en su escritorio (`User.activePetId`) si sigue
 * siendo suyo; si no, el más antiguo (la convención histórica del servidor).
 *
 * Función libre (no un método de `PetsService`) para que clanes, visitas y cuidado cooperativo la
 * usen sin importar `PetsModule` y sin ciclos de dependencias.
 */
export interface ActivePetPrisma {
  user: { findMany(args: any): Promise<Array<{ id: string; activePetId?: string | null }>> };
  pet: { findMany(args: any): Promise<Array<{ id: string; userId: string }>> };
}

/** userId → petId del pockai activo. Los usuarios sin mascotas no aparecen en el mapa. */
export async function resolveActivePetIds(
  prisma: ActivePetPrisma,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  const result = new Map<string, string>();
  if (ids.length === 0) return result;

  const [users, pets] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, activePetId: true } }),
    prisma.pet.findMany({
      where: { userId: { in: ids } },
      select: { id: true, userId: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const chosen = new Map(users.map((u) => [u.id, u.activePetId ?? null] as const));
  const owned = new Map<string, string[]>();
  for (const p of pets) {
    const list = owned.get(p.userId) ?? [];
    list.push(p.id);
    owned.set(p.userId, list);
  }
  for (const [userId, list] of owned) {
    const pick = chosen.get(userId);
    result.set(userId, pick && list.includes(pick) ? pick : list[0]);
  }
  return result;
}
