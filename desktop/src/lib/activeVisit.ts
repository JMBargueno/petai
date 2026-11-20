/**
 * Visita en vivo en curso (tu Pockai está en el hábitat de un amigo).
 *
 * Vive fuera del componente de Visitas: al cambiar de pestaña el componente se desmonta y, si el
 * estado fuera local, el botón «Terminar visita» desaparecería con la visita todavía activa.
 * Al cargar el historial se recupera también de ahí, por si la app se reinició a mitad. Esa parte
 * (deducirla del historial) es pura y vive en `@pockai/ui/social`.
 */
import { writable } from 'svelte/store';

export const activeVisit = writable<string>('');

export { VISIT_MAX_AGE_MS, ongoingVisitFrom, ongoingVisitLog, type VisitLog } from '@pockai/ui/social/visits';
