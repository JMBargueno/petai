# Brief y dibujo de muebles isométricos

Las reglas visuales de referencia están en `docs/GUIA_ARTISTICA.md` §7.4. Los muebles se dibujan a mano en SVG procedural (`scripts/sprites/furniture.ts`), igual que los Pockais: **sin IA ni emoji**.

## Geometría
- Celda: rombo de 32×16 px. Una huella `w×d` ocupa en pantalla un rombo de `(w + d)·16` px de ancho y `(w + d)·8` px de alto.
- **Ancla:** el vértice superior del rombo de la huella (celda `(x, y)`) está en el origen `(0, 0)` del SVG del mueble. El dibujo crece hacia abajo (suelo) y hacia arriba (altura). El `viewBox` deja margen arriba para la altura.
- **Caja base:** casi todo mueble empieza como una o varias cajas isométricas de altura `h`:
  - cara superior: rombo desplazado `−h` en y;
  - cara izquierda: paralelogramo sobre la arista `y`;
  - cara derecha: paralelogramo sobre la arista `x`.
  Después se redondean esquinas y se añaden detalles (cojines, patas, agua).
- **Orientaciones:**
  - `a` = rotación 0: el frente mira abajo-derecha.
  - `b` = rotación 1: el frente mira abajo-izquierda.
  - Las rotaciones 2 y 3 se obtienen con el espejo de `b` y `a`. Si el mueble es simétrico, `b` puede ser el espejo de `a`, pero la huella `w×d` se intercambia igual.

## Color y línea
- Tres tonos por material, con luz desde arriba a la izquierda: superior +12 % de luz, izquierda = base, derecha −18 %.
- Contorno exterior de 2 px en `#1A1A1A`; aristas interiores de 1–1,5 px al 60 %.
- Sin degradados realistas. Un brillo plano como mucho.
- Paleta: la del tema de la sala y la de marca (`GUIA_ARTISTICA` §3.1) para los acentos.
- Agua y cristal: el color de UI del elemento correspondiente (§3.6) con transparencia plana.
- Sombra de contacto: el rombo de la huella, negro al 15 %, debajo de todo.

## Plantilla del brief
- **Forma (1 frase):** cajas o volúmenes base y altura en px.
- **Huella y montaje:** `w×d`, suelo o pared, y por qué.
- **Materiales y tonos:** cada material con sus 3 tonos.
- **Detalle icónico:** lo que lo hace reconocible a su tamaño real.
- **Interacción:** dónde se coloca el Pockai (celda de uso, por ejemplo delante de la cama) y qué animación usa (sleep, eat…).
- **Orientación `b`:** qué cambia respecto a `a`.

## Checklist visual (en la hoja de contactos)
- [ ] Se reconoce a escala 1, sin zoom.
- [ ] La huella dibujada coincide con el rombo de referencia en las dos orientaciones.
- [ ] La luz es coherente: la cara superior es la más clara y la derecha la más oscura.
- [ ] El contorno exterior es continuo y no hay huecos ni líneas dobles.
- [ ] Junto al Pockai de referencia (~72 px) el tamaño es creíble.
- [ ] En el tema de noche se sigue leyendo (no se funde con el suelo).
- [ ] Los muebles de pared se apoyan en el plano de la pared correcto (izquierda en `a` y derecha en `b`).
