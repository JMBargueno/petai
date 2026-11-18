# Brief y dibujo del arte (3/4 isométrico, por etapa)

Los sprites **no se generan con IA**. Son SVG procedurales escritos a mano en `scripts/sprites/species.ts`: un `SpeciesArt` por especie, registrado en la lista `SPECIES`. Después, `pnpm generate:sprites` produce las hojas `shared/assets/species/<id>/…` y la vista previa `sprites/<id>_idle.svg`.

Toma como referencia de código `ignisaur`, `axolunar` y `florabud` en ese archivo, y lee `iso-style.md` para las reglas visuales.

El estilo objetivo es el **pixel art** de `pixel-style.md` (guía §7.5). El generador aún es vectorial, pero el diseño ya sigue sus reglas: formas grandes, tonos planos y etapas que cambian de verdad.

## Restricciones técnicas
- **Frame:** 128×128, con el suelo en **y = 120**, mirando **abajo-derecha** en 3/4. La otra diagonal sale por espejo, así que **no dibujes asimetrías que delaten el espejo** (textos, cicatrices en un solo lado con significado).
- **Firma:** `SpeciesArt { id, face: FaceAnchors | (stage) => FaceAnchors, top, draw(ctx, pose, stage) }`.
  - `FaceAnchors { l: [x,y], r: [x,y], er, mouth: [x,y] }`.
  - En 3/4, `l` es el **ojo cercano** (izquierda de la pantalla, tamaño completo) y `r` el **ojo lejano** (derecha, junto al contorno de la cara). Pon `far: 0.74` en las anclas: `face()` estrecha el ojo `r` y, en la máscara, pinta la zona de cara sin patrón.
  - La boca va bajo el punto medio de los ojos.
- **Etapas:** `stage ∈ baby | juvenile | adult | final`. Usa `stageParams(stage)` → `{ size, head, app, eye, accessory }` (valores en `iso-style.md`) como base de un único `draw`.
- **Cada etapa cambia de verdad:** `stageParams` solo da tamaño y proporción, y eso no basta. Cada etapa tiene su propio plan corporal y en cada salto cambian al menos cuatro de cinco ejes: plan corporal, rasgo icónico, piezas, color y marcas, cara (tabla en `pixel-style.md`). Dibújalo con ramas o helpers propios de etapa (`if (stage === 'baby')`), y con anclas de cara propias si hace falta: baby es una bola sin brazos ni cola con el rasgo en brote; adult separa cabeza y torso y gana manchas; final suma piezas que rompen el contorno, su accesorio y franjas. La especie debe seguir reconociéndose (misma paleta, misma forma de ojo, rasgo icónico en el mismo sitio), y no toques `STAGE_PARAMS`, que comparten todas las especies.
- **Patrón a seguir:** envuelve la cabeza en `scaleAt(st.head, cuelloX, cuelloY, …)` y todo el dibujo en `scaleAt(st.size, 64, 120, …)`; multiplica `p.app` por `st.app` y usa `stageFace()` para el ojo. Mira `ignisaur` como referencia.
- **Roles de color (máscara):** `body` (primario, canal R), `limb` (extremidades), `accent` (accesorios) y `mix`. El patrón va en el canal B, **nunca sobre la cara ni los ojos**.
- **Contorno:** el principal es `#1A1A1A` (`LINE`). Los accesorios llevan 2 px en el accent (GUIA_ARTISTICA §7.1).
- **Partes móviles:** las 31 animaciones (idle, walk, eat, happy, sleep, attack, evolution…) salen de las poses de `scripts/sprites/poses.ts`, así que las partes deben poder moverse con los campos de `Pose`:
  - `armL/armR`, `leg`, `tail`.
  - `app/appRot` (apéndices: branquias, pétalos, llama).
  - `sit`, `eyes`, `mouth`, `look`.
- **Sombra:** no la dibujes en el `SpeciesArt`; la pone el generador como elipse isométrica.

## Plantilla del brief (va en la ficha)
- **Silueta (1 frase):** forma base y proporción cabeza/cuerpo en adulto.
- **Partes:** cada pieza (cuerpo, cabeza, extremidades cercanas/lejanas, cola, accesorios) con su rol de color.
- **Rasgos icónicos:** los 2 de la ficha y cómo se leen a **72 px** (tamaño en sala) y a 128 px.
- **Cara en 3/4:** anclas aproximadas (ojo lejano, ojo cercano y boca) y expresión base.
- **Evolución visual:** para cada etapa, su plan corporal y qué cambia en los cinco ejes (plan corporal, rasgo icónico, piezas, color y marcas, cara). Indica también qué no cambia, para que la especie siga reconociéndose de baby a final.
- **Anclas de accesorios:** por etapa, dónde van `head`, `face`, `neck` y `back`, y cualquier salvedad (por ejemplo, «el gorro se ladea porque la cresta es central»).
- **Movimiento:** qué parte "vende" cada pose clave. Por ejemplo: en idle respira con…, en attack lanza…, en sleep se enrosca…
- **Zona de patrón:** dónde se ve el patrón (lomo, alas…) y dónde no.

## Dibujar (paso 5b de SKILL.md)
1. Añade el `SpeciesArt` en `scripts/sprites/species.ts`, siguiendo el patrón de las especies existentes: helpers `part(ctx, role, …)`, `leg`, `arm` y `foodAndFace`, y regístralo en `SPECIES`.
2. Genera la hoja de contactos y **mírala** (Read del PNG):
   ```bash
   npx tsx .claude/skills/pockai-architect/scripts/contact_sheet.ts <id>
   ```
   Escribe `sprite-previews/<id>-contact.png`, que está ignorado por git. Tiene 4 filas de etapa y otras tres (a escala de sala, a ~72 px; en espejo; y la máscara) de la etapa adult. Si estás retocando otra etapa, añade `--stage baby` (o la que sea) para que esas tres filas sean de esa etapa: la máscara y la lectura a 72 px son donde se ven los fallos.
3. Revísala con esta checklist y corrige hasta que todo pase:
   - [ ] La silueta y los 2 rasgos icónicos se reconocen en la fila de ~72 px.
   - [ ] Es 3/4 de verdad: se ven la cara y el costado derecho, el ojo lejano es más estrecho y las patas lejanas asoman detrás.
   - [ ] Todo es coherente con la luz desde arriba a la izquierda (brillos `lit` a la izquierda).
   - [ ] **Máscara:** la zona de patrón es todo píxel con canal B. En la fila de máscara, el rol `body` sale **magenta** (R+B); `limb` (rojo), `accent` (verde) y `mix` (oliva) no llevan B. Revisa dos cosas:
     - La cara (zona entre los ojos y la boca) no debe salir magenta: necesita un parche sin B.
     - Los efectos deben ser negro puro.
     Ojo: hoy las 3 especies de perfil **no cumplen** esto (cabeza entera en `body`), y se corrige al pasar a 3/4.
   - [ ] **Etapas:** baby es cabezón y tierno, final lleva su accesorio, y las 4 son la misma especie.
   - [ ] **Cambio entre etapas:** en la fila de etapas, cada una se distingue de la anterior por su plan corporal o silueta y por al menos tres ejes más (rasgo icónico, piezas, color y marcas, cara). En negro, las cuatro siluetas se distinguen. Si dos solo difieren en tamaño, falta cambio.
   - [ ] **Accesorios:** hay sitio para gorro, gafas, bufanda y capa en las 4 etapas sin tapar ojos, boca ni rasgo icónico.
   - [ ] **Espejo:** sigue leyéndose bien y nada queda "al revés".
   - [ ] **Poses:** las partes se mueven (la cola en walk, los brazos en happy, se enrosca en sleep), nada se sale del frame y nada se despega del cuerpo.
4. `pnpm generate:sprites` regenera **todas** las especies. Antes de commitear, comprueba con `git diff --stat` que el resto de especies no cambió, salvo que hayas tocado código común.

## Placeholders (solo si el usuario no quiere arte todavía)
1. `node scripts/generate-placeholder-assets.js <id>` → `species/<id>/` (una elipse genérica). **Siempre con id**: sin argumentos regenera las especies base y machaca su arte.
2. `node .claude/skills/pockai-architect/scripts/placeholder_svgs.mjs <id>` → `sprites/<id>_{idle,eat,happy,sleep}.svg`, con la plantilla 3/4 y la paleta de la especie.
