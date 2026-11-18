/**
 * Escritura de texto que respeta el fin de línea del archivo existente.
 *
 * En Windows (core.autocrlf=true) los archivos del repo están en CRLF en disco. Si un generador los
 * reescribe en LF, git los marca como modificados aunque el contenido no cambie, y había que
 * restaurarlos a mano después de cada `pnpm generate:sprites` o `generate:furniture`. Con esto, un
 * archivo que no cambia queda idéntico en disco.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export function writeTextKeepEol(file: string, text: string): void {
  const lf = text.replace(/\r\n/g, '\n');
  let out = lf;
  if (existsSync(file)) {
    const prev = readFileSync(file, 'utf8');
    if (prev.includes('\r\n')) out = lf.replace(/\n/g, '\r\n');
    if (prev === out) return; // sin cambios: no tocar el archivo (ni su fecha)
  }
  writeFileSync(file, out);
}
