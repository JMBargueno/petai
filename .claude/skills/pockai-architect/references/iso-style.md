# Cámara, luz y cara en 3/4

Es un resumen práctico de `docs/GUIA_ARTISTICA.md` §7.4. Si hay conflicto, manda la guía.

## Cámara y proyección
- Usamos dimétrica 2:1: cada celda es un rombo de 32×16 px, con `sx = (x − y)·16` y `sy = (x + y)·8`.
- El Pockai se ve **desde arriba en diagonal**: mira abajo-derecha y tiene el cuerpo girado ~30° respecto al perfil.
- Lo que está más cerca de la cámara queda **más abajo y más grande** en el frame:
  - La pata cercana derecha baja hasta y ≈ 116–120.
  - La lejana izquierda se queda en y ≈ 106–110, es un 15–20 % más pequeña y va **detrás** del cuerpo en el orden de pintado.

## Luz
- Viene desde arriba a la izquierda.
- Los brillos (`lit`) van arriba a la izquierda de cada volumen y las sombras propias abajo a la derecha.
- En los muebles: cara superior +12 % de luz, cara izquierda = base, cara derecha −18 %.

## Cara en 3/4
| Ancla | Perfil (antes) | 3/4 (ahora) |
|---|---|---|
| Ojo cercano `l` | — | izquierda de la cara, tamaño completo |
| Ojo lejano `r` | — | a ~18–21 px del cercano, junto al contorno derecho, ancho ×0,74 (`far`) |
| Boca | en el borde | bajo el punto medio entre los dos ojos, desplazada 4–6 px a la derecha |

## Etapas
Cada etapa es una geometría propia, con su plan corporal: ver `pixel-style.md` y `art-brief.md`.

## Escala en sala
- En el hábitat, el Pockai se ve a 64 px (×1: 1 px nativo = 1 px de sala), junto a muebles de 16–64 px de alto.
- Cualquier detalle de menos de 2 px nativos desaparece: mejor formas grandes.

## Errores típicos
- **Perspectiva mixta:** cabeza de perfil sobre un cuerpo en 3/4, o los dos ojos iguales.
- **Sombra de suelo** dibujada dentro de la especie: la ponen los clientes.
- **Patrón (canal B) sobre la cara**, o la cara pintada con un rol que lleva B.
- **Rasgos que dependen del lado:** al hacer espejo, una marca "del lado del corazón" acaba en el otro lado.
- **Etapas que solo cambian de tamaño:** cada etapa necesita su propio plan corporal, piezas y marcas (`pixel-style.md`), siempre sobre la misma especie.
- Detalles finos que se pierden a 64 px.
