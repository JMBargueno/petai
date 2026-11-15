/**
 * Nombres de cola (BullMQ) — R-01.
 *
 * Convención: una cola por tipo de trabajo diferido. Hoy: `webhooks` (entrega durable y
 * distribuida de eventos a los webhooks del usuario). Se ampliará aquí (notificaciones,
 * liquidaciones…) conforme se migren los restantes trabajos lentos fuera de la petición.
 */
export const WEBHOOKS_QUEUE = 'webhooks';
