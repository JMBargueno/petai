/** Texto de los mensajes del chat. */

const BOLD = '**';

/**
 * Parte un texto en tramos normales y en negrita (`**así**`) para pintarlos sin HTML: quien lo
 * muestra decide la etiqueta. Las marcas sueltas se descartan.
 */
export function parseBold(text: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const plain = (t: string) => {
    const clean = t.split(BOLD).join('');
    if (clean) out.push({ text: clean, bold: false });
  };
  let last = 0;
  for (const m of text.matchAll(/\*\*(.+?)\*\*/g)) {
    plain(text.slice(last, m.index));
    out.push({ text: m[1], bold: true });
    last = m.index! + m[0].length;
  }
  plain(text.slice(last));
  return out;
}
