// Voz de la mascota: reescribe en primera persona los errores de negocio que conocemos del backend
// (backend/src/modules/pets/pets.service.ts) para que los diga la propia mascota en su bocadillo.
// Si el mensaje no está en la lista, se devuelve tal cual.

const PET_VOICE: Array<[RegExp, string]> = [
  [/ya está limpia/i, '¡Ya estoy limpito! Báñame cuando me ensucie.'],
  [/no puedes bañar .*mientras duerme/i, 'Zzz… déjame dormir, ya me bañarás luego.'],
  [/no puedes alimentar .*mientras duerme/i, 'Zzz… ahora estoy durmiendo, dame de comer luego.'],
  [/ya está durmiendo/i, '¡Si ya estoy durmiendo! Zzz…'],
  [/ya está despierta/i, '¡Ya estoy despierto, mírame!'],
  [/no tienes medicinas/i, 'No tienes medicinas para mí…'],
  [/no tiene propiedades medicinales/i, 'Eso no me va a curar…'],
  [/forma final/i, '¡Ya no puedo evolucionar más!'],
  [/mascota no encontrada/i, 'Mmm… no encuentro a tu mascota.'],
  [/(monedas|saldo|fondos) insuficientes|no tienes (suficientes )?monedas/i, 'No te llegan las monedas para eso…'],
];

export function petVoice(message: string): string {
  for (const [pattern, line] of PET_VOICE) {
    if (pattern.test(message)) return line;
  }
  return message;
}
