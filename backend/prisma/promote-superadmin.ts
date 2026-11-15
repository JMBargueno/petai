/**
 * Bootstrap del primer SuperAdmin (no existe vía HTTP para crearlo).
 *
 *   pnpm --filter petai-backend authz:promote admin@ejemplo.com [otro@ejemplo.com]
 *
 * Sin argumentos usa SUPERADMIN_EMAILS (lista separada por comas). Idempotente: la cuenta debe existir
 * (registrarse antes por la app); si ya es superadmin no hace nada. También lo invoca `seed.ts`.
 */
import { PrismaClient } from '@prisma/client';

export function parseEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function promoteSuperadmins(prisma: PrismaClient, emails: string[]): Promise<void> {
  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user) {
      console.warn(`⚠ No existe ninguna cuenta con ${email}: regístrala primero y repite.`);
      continue;
    }
    if (user.role === 'superadmin') {
      console.log(`✓ ${email} ya es superadmin.`);
      continue;
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: 'superadmin' } }),
      prisma.auditLog.create({
        data: { userId: user.id, event: 'role_change', metadata: { from: user.role, to: 'superadmin', by: 'cli' } },
      }),
    ]);
    console.log(`✓ ${email} promovido a superadmin (antes: ${user.role}).`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const emails = args.length ? parseEmails(args.join(',')) : parseEmails(process.env.SUPERADMIN_EMAILS);
  if (!emails.length) {
    console.error('Indica uno o más correos como argumento o en SUPERADMIN_EMAILS.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  promoteSuperadmins(prisma, emails)
    .catch((e) => {
      console.error('Error al promover superadmin:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
