/** Aviso tras inscribirse en el torneo, igual en todas las apps. */
export function tournamentEnterText(res: { elo: number; feePaid: number }): string {
  return `Inscripción confirmada. Entras con ${res.elo} de ELO y has pagado ${res.feePaid} gemas.`;
}
