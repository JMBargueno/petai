# Brief y dibujo del arte (pixel art, 3/4, una geometría por etapa)

Los sprites **no se generan con IA** ni se dibujan en un editor: son pixel art procedural. Cada especie es un `PixelSpecies` en `scripts/sprites/pixel/species.ts`, con una geometría por etapa, y un rasterizador la convierte en píxeles. `pnpm generate:sprites` produce las hojas `shared/assets/species/<id>/…`, las anclas de accesorio y las vistas previas `sprites/<id>_*.svg`.

Toma como referencia de código `IGNISAUR`, `AXOLUNAR` y `FLORABUD` en ese archivo. Las reglas visuales están en `pixel-style.md` (estilo y etapas) y en `iso-style.md` (cámara, luz y cara en 3/4).

## Cómo funciona
- **Rejilla:** 64×64 px nativos, suelo en la fila 60, mirando **abajo a la derecha** en 3/4. La hoja se guarda a ×2 (frames de 128×128). La otra diagonal sale por espejo: **no dibujes asimetrías que delaten el espejo**.
- **Formas, no píxeles sueltos:** dibujas con elipses (`g.ellipse`, admite giro) y polígonos (`g.poly`) en coordenadas nativas. El rasterizador pone el sombreado en tres tonos (luz arriba a la izquierda), el brillo y el contorno de 1 px.
- **Una geometría por etapa:** `stages: { baby, juvenile, adult, final }`. Cada una parte de `stage('<etapa>', { … })`, que da el cuerpo común de esa etapa (torso, cabeza si la hay, pies, brazos, barriga, ojos), y tú cambias lo que haga falta y añades los ganchos de la especie.
- **Ganchos de la especie:**
  - `behind(g, s, p)`: lo que va detrás del cuerpo (cola, aletas, púas, branquias).
  - `onHead(g, s, p)`: lo que va sobre la cabeza, pintado después (cuernos, hojas, cresta, collar).
  - `front(g, s, p)`: lo que va por delante de todo el cuerpo (patas cercanas de un cuadrúpedo, la nube de un flotante).
- **Planes corporales que no son bípedos** (`pixel-style.md`): la geometría común es un bípedo, pero todo se puede quitar o mover.
  - Quita piezas con `undefined`: `head` (un solo volumen en adult y final), `arm`, `farArm`, `feet` (flota o repta), `belly`, `marks`, `emblem`. Ojo: `stage('adult')` y `stage('final')` traen `head`; si tu plan es de un volumen, quítala o saldrá una bola encima.
  - Mueve `torso`, `head` y `eye` adonde toque. Conserva el ancho y la separación de los ojos de la etapa (`{ ...BASE.adult.eye, y, x1, x2 }`) para que las gafas sigan encajando.
  - Apoyos propios: `step(p, [cx, cy, rx, ry], fase)` devuelve la elipse desplazada con el paso. `hindFar`/`hindNear` son las patas traseras de un cuadrúpedo. Usa `p.leg` y `-p.leg` para alternar. Un flotante no lleva apoyos: nada bajo el cuerpo.
  - Cara propia: `eye.style` (`bead`, `lid`, `grumpy`, `almond`, `shine`, `fierce`, `lash`, `slit`, `ring`, `spark` o sin estilo) cambia la forma del ojo abierto; el resto de expresiones son comunes. Mueve también la altura y la separación de los ojos según el animal.
  - `hat: [x, y]` fija el ancla `head` cuando lo alto del cuerpo no es el sitio del gorro.
  - Para fundir una pieza con el tronco sin línea de separación, píntala con la pieza 4 en `behind` (los brazos del Cactuerno).
  - Referencias: `MAGMADILLO` (cuadrúpedo bajo), `CERBITO` (cuadrúpedo sentado de tres cabezas), `KIRISOL` (cuadrúpedo esbelto), `NUBEBALLENA` (flotante), `CACTUERNO` (columna) `FENIXEL` (ave de cuello largo), `LEVIATIN` (serpentino), `YGGDRITO` (árbol) y `PRIMPULSO` (dragón erguido). Los tres míticos usan la técnica de míticos de `pixel-style.md` (`tube`, `ridge`, `glow`, `canopy`, `dragonWing`).
  - La cara no tiene por qué ir en la cabeza: en un árbol va en el tronco (`eye` sobre el `torso`) y la `head` es la copa.
  - Más de una cabeza: solo la principal es `head` y lleva la cara animada y las anclas de accesorio. Las demás se pintan en `behind` con `sideHead()`, con ojos fijos.
- **Papeles de color (`Role`):** `body` (primario, admite patrón), `skin` (primario sin patrón: extremidades y cara), `belly` (secundario plano), `trait` (secundario con sombra: el rasgo icónico) y `mark` (primario oscurecido: manchas, franjas, púas). No hay más colores: la paleta de la mascota solo tiene primario y secundario.
- **Piezas (`part`):** dos formas con el mismo número de pieza se funden; con números distintos, el rasterizador pone una línea de separación entre ellas. Con `{ clip: n, keep: true }` pintas una mancha dentro de la pieza `n` sin crear línea.
- **Movimiento:** las 31 animaciones salen de las poses de `scripts/sprites/poses.ts`, que no se tocan. Para que tus piezas se muevan con ellas, envuélvelas en los ayudantes:
  - `tail(g, p, x, y, () => …)`: gira desde la base de la cola con la pose.
  - `appendage(g, p, x, y, () => …)`: escala y gira el rasgo icónico (llama, branquias, hojas) desde su base.
  - Brazos, pies, cuerpo y cara ya los mueve el dibujo común.
- **Lo que no dibujas:** la sombra de suelo (la ponen los clientes), los ojos y la boca (salen de `eye` en la geometría), y los efectos.
- **Anclas de accesorio:** `neck` y `back` van en la geometría de cada etapa; `head` y `face` se calculan solos. El generador escribe `anchors.json`.

## Límites por etapa
| Etapa | Altura máxima | Plan corporal |
|---|---|---|
| baby | 28 px | Un volumen (solo `torso`), sin brazos ni cola |
| juvenile | 36 px | Un volumen, con `arm` y cola |
| adult | 46 px | Dos volúmenes (`torso` y `head`) |
| final | 54 px | Dos volúmenes y piezas que rompen el contorno |

La hoja de contactos imprime la altura real de cada etapa: si se pasa, baja o acorta lo que sobresale. Si una pose saca la criatura del frame, el rasterizador la recoloca sola.

## Plantilla del brief (va en la ficha)
- **Plan corporal:** cuál de `pixel-style.md` (o uno nuevo) y en qué se diferencia de las especies más parecidas.
- **Silueta (1 frase):** forma base y proporción cabeza/cuerpo en adulto.
- **Rasgos icónicos:** los 2 de la ficha, con qué papel de color van y cómo se leen a 64 px.
- **Estrenos por etapa:** una frase por etapa con la forma del cuerpo y de dos a cuatro piezas nuevas; en la final, un material nuevo (formato y ejemplos en `design-lessons.md` §3).
- **Evolución visual:** para cada etapa, su plan corporal y qué cambia en los cinco ejes (plan corporal, rasgo icónico, piezas, color y marcas, cara). Indica también qué no cambia, para que la especie siga reconociéndose de baby a final.
- **Anclas de accesorios:** por etapa, dónde van `neck` y `back`, y cualquier salvedad (por ejemplo, «el gorro se ladea porque la cresta es central»).
- **Movimiento:** qué pieza «vende» cada pose clave: qué gira con la cola y qué late con los apéndices.
- **Zona de patrón:** dónde se ve el patrón (piezas en `body`) y dónde no.

## Dibujar (paso 5b de SKILL.md)
1. Añade el `PixelSpecies` en `scripts/sprites/pixel/species.ts`, siguiendo el patrón de las especies existentes, y regístralo en `PIXEL_SPECIES`.
2. Genera la hoja de contactos y **mírala** (Read del PNG):
   ```bash
   npx tsx .claude/skills/pockai-architect/scripts/contact_sheet.ts <id>
   ```
   Escribe `sprite-previews/<id>-pixel-contact.png`, que está ignorado por git: una fila por etapa con diez poses clave a ×2, y debajo las cuatro siluetas en negro a ×1. Por consola da la altura de cada etapa.
3. Revísala con esta checklist y corrige hasta que todo pase. Normalmente hacen falta 2 o 3 vueltas:
   - [ ] La silueta y los 2 rasgos icónicos se reconocen en la fila de siluetas (64 px).
   - [ ] Es 3/4 de verdad: se ven la cara y el costado derecho, y lo lejano asoma detrás.
   - [ ] **Alturas:** ninguna etapa pasa de su máximo.
   - [ ] **Cambio entre etapas:** cada una se distingue de la anterior por su plan corporal o silueta y por al menos tres ejes más. En negro, las cuatro siluetas se distinguen. Si dos solo difieren en tamaño, falta cambio.
   - [ ] **Distinta de las demás:** su plan corporal no repite el de otra especie del mismo elemento o rareza, y se diferencia de cualquier otra en al menos cuatro de: apoyo, proporción, cabeza, extremidades, rasgo icónico, contorno y cara. Compara su fila de siluetas con las de las demás (`sprite-previews/*-pixel-contact.png`).
   - [ ] **La rareza se ve:** el nivel de detalle corresponde a su rareza (tabla «Cuanto más rara, más trabajada» de `pixel-style.md`). Un legendario impone por proporción; un mítico usa la técnica de míticos y llena el frame en su etapa final.
   - [ ] **La forma dice la edad:** la cría es redonda; las terminaciones de adult y final acaban en punta; cada etapa estrena dos o tres piezas; la final estrena un material o un oscuro que no había.
   - [ ] **La cara madura:** el ojo de la etapa final es más pequeño y duro que el de la cría, y su cabeza tiene hocico, mandíbula o cresta. Ninguna etapa final sonríe como una cría.
   - [ ] **Proporción de animal:** se reconoce por la proporción del animal real (peso, cuello, patas), no solo por las orejas o las alas.
   - [ ] **Blando y duro:** lo blando (tentáculos, colas, crines) dibuja una curva; lo duro (cuernos, garras) es recto. Ningún tentáculo ni mechón es una elipse recta.
   - [ ] **Marcas que crecen:** liso, zona de color, patrón visible, patrón por todo el cuerpo con emblema. La etapa final se ve más oscura que la adulta.
   - [ ] **¿Con qué se confunde?** Mira la hoja y di con qué otro animal se podría confundir cada etapa. Si hay respuesta, corrige (los tentáculos rectos del Inktopus lo hacían parecer una araña).
   - [ ] **Profundidad y trama** (legendarios y míticos): lo de detrás va más oscuro, cada extremidad tiene tramos y remate, y cada material lleva su trama.
   - [ ] **Anatomía con sentido:** ninguna pieza que el animal no tendría (pies en una ballena, brazos en un pulpo) y nada colgando bajo el cuerpo que se lea como pies.
   - [ ] **Misma especie:** misma paleta, misma forma de ojo y rasgo icónico en el mismo sitio en las cuatro.
   - [ ] **Poses:** la cola y el rasgo icónico se mueven (walk, happy, attack), nada se despega del cuerpo y nada desaparece al dormir.
   - [ ] **Accesorios:** hay sitio para gorro, gafas, bufanda y capa en las 4 etapas sin tapar ojos, boca ni rasgo icónico.
   - [ ] **Espejo:** sigue leyéndose bien y nada queda «al revés».
4. `pnpm generate:sprites` regenera **todas** las especies (es determinista). Antes de commitear, comprueba con `git diff --stat` que el resto de especies no cambió, salvo que hayas tocado código común de `scripts/sprites/pixel/`.

## Placeholders (solo si el usuario no quiere arte todavía)
1. `node scripts/generate-placeholder-assets.js <id>` → `species/<id>/` (una elipse genérica). **Siempre con id**: sin argumentos regenera las especies base y machaca su arte.
2. `node .claude/skills/pockai-architect/scripts/placeholder_svgs.mjs <id>` → `sprites/<id>_{idle,eat,happy,sleep}.svg`.

Una especie con placeholder no tiene `anchors.json`: `validate-assets.js` lo marca como error crítico hasta que tenga arte real.
