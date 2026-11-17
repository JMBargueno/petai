# Brief de arte

Los sprites **no se generan con IA**: son SVG procedurales escritos a mano en `scripts/sprites/species.ts` (un `SpeciesArt` por especie, lista `SPECIES`) y `pnpm generate:sprites` produce `shared/assets/species/<id>/{base.png,mask.png,anim.json}` y `sprites/<id>_idle.svg`. Mira `ignisaur`, `axolunar` y `florabud` en ese archivo como referencia.

## Restricciones técnicas
- Frame 128×128, **mirando a la derecha**, suelo en **y = 120**.
- `SpeciesArt { id, face: FaceAnchors, top, draw(ctx, pose) }`; `FaceAnchors { l: [x,y], r: [x,y], er, mouth: [x,y] }` (ojos izq/der, radio de ojo, boca).
- Roles de color (máscara): `body` (primary, canal R), `limb` (extremidades), `accent` (accesorios), `mix`. El patrón se proyecta en canal B: **nunca sobre la cara**.
- Contorno principal `#1A1A1A`; accesorios con contorno de 2 px en el accent (GUIA_ARTISTICA §7.1).
- 31 animaciones (idle, walk, eat, happy, sleep, attack, evolution…) salen de las poses de `draw`, así que las partes deben poder moverse (cola, orejas, alas).

## Plantilla del brief (va en la ficha)
- **Silueta (1 frase):** forma base + proporción cabeza/cuerpo.
- **Partes:** lista de piezas (cuerpo, cabeza, extremidades, cola, accesorios) con su rol de color.
- **Rasgos icónicos:** los 2 de la ficha, cómo se ven a 128 px.
- **Cara:** posición aproximada de ojos y boca (anclas), expresión base.
- **Movimiento:** qué parte "vende" cada pose clave (idle respira con…, attack lanza…, sleep se enrosca…).
- **Zona de patrón:** dónde se ve el patrón (lomo, alas…) y dónde no.

## Placeholders (mientras no hay arte)
1. `node scripts/generate-placeholder-assets.js <id>` → `species/<id>/` (elipse genérica, tags idle/walk/eat/happy/sleep/attack). **Siempre con id**: sin argumentos regenera las especies base y machaca su arte.
2. `node .claude/skills/pockai-architect/scripts/placeholder_svgs.mjs <id>` → `sprites/<id>_{idle,eat,happy,sleep}.svg` con la plantilla de GUIA_ARTISTICA §7.1 y la paleta de la especie (lee species.json).
