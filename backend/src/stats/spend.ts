import { Prisma } from '@prisma/client';

/**
 * Registra un gasto de monedas/gemas en las estadísticas (`coins_spent`/`gems_spent`) DENTRO de la
 * transacción del cobro: si el cobro se revierte, el gasto tampoco cuenta. Los logros de gasto se
 * evalúan en la siguiente evaluación del usuario (tick de presencia o lectura del perfil).
 */
export async function recordSpend(
  tx: Prisma.TransactionClient,
  userId: string,
  currency: 'coins' | 'gems',
  amount: number,
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) return;
  const key = currency === 'coins' ? 'coins_spent' : 'gems_spent';
  await tx.userStat.upsert({
    where: { userId_key: { userId, key } },
    update: { value: { increment: amount } },
    create: { userId, key, value: amount },
  });
}
