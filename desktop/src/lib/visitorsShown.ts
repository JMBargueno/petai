import type { HabitatVisitor } from './api';

/** Un visitante pintado junto a la mascota; `leaving` mientras cruza su portal de salida. */
export interface ShownVisitor {
  v: HabitatVisitor;
  leaving: boolean;
}

/**
 * Concilia lo pintado con la lista del store (`visitorsStore`). Los que ya no están no se quitan:
 * se marcan `leaving` para que crucen su portal; los nuevos se añaden al final; si uno que se iba
 * vuelve a entrar, deja de irse. Mantiene el orden para no recolocar a nadie.
 */
export function syncShownVisitors(shown: ShownVisitor[], current: HabitatVisitor[]): ShownVisitor[] {
  const byId = new Map(current.map((v) => [v.visitorId, v]));
  const next: ShownVisitor[] = shown.map((s) => {
    const fresh = byId.get(s.v.visitorId);
    return fresh ? { v: fresh, leaving: false } : { v: s.v, leaving: true };
  });
  for (const v of current) {
    if (!shown.some((s) => s.v.visitorId === v.visitorId)) next.push({ v, leaving: false });
  }
  return next;
}

/** El visitante terminó de cruzar su portal de salida: deja de pintarse (si de verdad se fue). */
export function dropGoneVisitor(shown: ShownVisitor[], visitorId: string): ShownVisitor[] {
  return shown.filter((s) => !(s.v.visitorId === visitorId && s.leaving));
}
