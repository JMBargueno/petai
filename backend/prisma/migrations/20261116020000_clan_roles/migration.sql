-- Rangos del clan (lore: Nexo de Resonancia): creator (Forjador), admin (Guardián),
-- moderator (Vigía) y member (Hermano). El antiguo 'leader' pasa a ser 'creator'.
UPDATE "ClanMembership" SET "role" = 'creator' WHERE "role" = 'leader';

-- Garantiza que el Forjador coincide con Clan.leaderId aunque hubiera datos desalineados.
UPDATE "ClanMembership" m
SET "role" = 'creator'
FROM "Clan" c
WHERE m."clanId" = c."id" AND m."userId" = c."leaderId" AND m."role" <> 'creator';

-- Cualquier otro valor desconocido se degrada a miembro.
UPDATE "ClanMembership" SET "role" = 'member' WHERE "role" NOT IN ('creator', 'admin', 'moderator', 'member');

-- Solo se admiten los rangos conocidos (el schema usa String, no enum de Prisma).
ALTER TABLE "ClanMembership" ADD CONSTRAINT "ClanMembership_role_check" CHECK ("role" IN ('creator', 'admin', 'moderator', 'member'));
