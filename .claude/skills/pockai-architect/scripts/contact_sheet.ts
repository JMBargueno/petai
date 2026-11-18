#!/usr/bin/env tsx
/**
 * Hoja de contactos de una especie, para revisar su arte a simple vista.
 *
 *   npx tsx .claude/skills/pockai-architect/scripts/contact_sheet.ts <id> [--out dir]
 *
 * Delega en `scripts/sprites/pixel/contact.ts`: escribe `sprite-previews/<id>-pixel-contact.png`
 * (una fila por etapa con poses clave y, debajo, las cuatro siluetas en negro a 64 px) e imprime
 * la altura de cada etapa.
 */
import '../../../../scripts/sprites/pixel/contact';
