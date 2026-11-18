# Estilo isométrico para dibujar Pockais

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

## Etapas (`stageParams`)
Valores reales en `STAGE_PARAMS` (`scripts/sprites/species.ts`):

| Etapa | `size` | `head` | `app` | `eye` | `accessory` | Notas |
|---|---|---|---|---|---|---|
| baby | 0,78 | 1,26 | 0,55 | 1,18 | — | cabezón, apéndices pequeños |
| juvenile | 0,9 | 1,12 | 0,8 | 1,08 | — | |
| adult | 1 | 1 | 1 | 1 | — | rasgo icónico completo |
| final | 1 | 0,97 | 1,12 | 1 | sí | accesorio que lea el elemento (cresta de fuego, media luna, corona de pétalos) |

El rasgo icónico **crece** con la etapa, pero no cambia de forma. Si un baby y un final no parecen de la misma especie, está mal.

Estos parámetros son solo la base. Cada etapa tiene además su propio plan corporal, y en cada salto cambian cuatro de cinco ejes: ver `pixel-style.md`.

## Escala en sala
- En el hábitat, el Pockai se ve a ~72 px (escala ≈ 0,56), junto a muebles de 16–64 px de alto.
- Cualquier detalle de menos de 3 px en el frame de 128 desaparece: mejor formas grandes y contornos limpios.

## Errores típicos
- **Perspectiva mixta:** cabeza de perfil sobre un cuerpo en 3/4, o los dos ojos iguales.
- **Sombra circular** o dibujada dentro del `SpeciesArt` (la pone el generador).
- **Patrón (canal B) sobre la cara**, o la cara pintada con un rol que lleva B.
- **Rasgos que dependen del lado:** al hacer espejo, una marca "del lado del corazón" acaba en el otro lado.
- **Etapas que solo cambian de tamaño:** cada etapa necesita su propio plan corporal, piezas y marcas (`pixel-style.md`), siempre sobre la misma especie.
- Detalles finos que se pierden a 72 px.
