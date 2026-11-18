# Magmadillo — «El guardián del horno»

> Un armadillo de coraza volcánica cuyas grietas brillan cuando se emociona. Es tranquilo y protector, y se hace una bola cuando algo le asusta.

| Elemento | Rareza | Arquetipo | Comida favorita |
|---|---|---|---|
| fire (Flujo del Fuego) | super_rare (Anomalía Resonante) | Tanque | Baya Picante (`spicy_berry`) |

## Clasificación y hábitat
- **Tipo:** bestia acorazada.
- **Plan corporal:** cuadrúpedo bajo y largo (ver `references/pixel-style.md`).
- **Tamaño aparente:** mediano.
- **Hábitat en el Éter:** salas de máquinas, junto a los ventiladores que nunca paran.
- **Comportamiento social:** en pareja; elige a quién proteger y no se separa.

## Anatomía y rasgos distintivos
Camina a cuatro patas, con el lomo cubierto por una coraza de placas. Entre placa y placa corren grietas por las que se ve el calor que guarda dentro. Cuando se asusta se enrosca; cuando está contento, las grietas se encienden.
- **Rasgos icónicos (silueta):** 1) la coraza abombada de placas con grietas incandescentes; 2) las orejas en punta y la cola acorazada.

## Ecología y lore
Un servidor trabajó sin descanso durante un verano entero, al límite de su temperatura, y no se apagó. Ese aguante resonó en el Éter hasta formar una criatura hecha para resistir el calor en lugar de huir de él. Es una Anomalía Resonante: no nació de un recuerdo, sino de un esfuerzo sostenido. Los Custodios dicen que un Magmadillo dormido junto a un equipo lo mantiene a salvo.

## Comportamiento en combate
- **Arquetipo:** tanque — stat dominante `def` 70, con `hp` 62.
- **Skills recomendadas (4):** `guard` (su base), `ember` (quema mientras aguanta), `flame_burst` (su golpe elemental), `recover` (alarga el combate).
- **Ventajas / debilidades:** fuerte contra planta; débil frente a agua.

## Personalidad de partida (`personalityBias`)
| Curiosidad | Sociabilidad | Valentía | Afectividad | Temperamento |
|---|---|---|---|---|
| 40 (steady) | 45 (steady) | 70 (brave) | 65 (affectionate) | 30 (calm) |

Valiente y calmado: no busca pelea, pero no se aparta.

**Cómo puede evolucionar:** con combates y aventuras se vuelve un protector decidido; con mucho juego en casa baja la guardia y gana sociabilidad.
**Vida autónoma típica:** hace rondas por el hábitat, se tumba cerca de su Custodio y duerme enroscado.

## Evolución *(cada etapa con su plan corporal; en cada salto cambian 4 de 5 ejes: `references/pixel-style.md`)*
| Etapa | Narrativa | Plan corporal y silueta | Rasgo icónico y piezas | Color, marcas y cara |
|---|---|---|---|---|
| **Baby (1)** | Vive enroscado | Una bola: aún no se ha desenroscado | Media coraza con una sola grieta; orejitas | Mofletes, ojos enormes |
| **Juvenile (10)** | Se desenrosca y echa a andar | Cuadrúpedo: cuerpo tumbado, cabeza delante, cuatro patas y cola | Dos franjas de placa | Panza clara |
| **Adult (25)** | Aguanta lo que le echen | Coraza alta, cabeza grande | Tres franjas con grietas encendidas, placa en la frente, cola anillada, orejas largas | Grietas en el secundario |
| **Final (50, Piedra de Evolución)** | Un volcán pequeño y paciente | Más ancho, con chimeneas que rompen el contorno | Tres chimeneas con llama, cuerno en la frente y ascua en la cola, que leen el elemento | Patas oscuras, mirada decidida |

**No cambia:** la paleta, los ojos de párpado caído, la coraza sobre el lomo y las orejas en punta.

**Anclas de accesorios:** `head` sobre la cabeza, entre las orejas; `neck` bajo la cabeza, donde se junta con el cuerpo; `back` en lo alto de la coraza.

## Frases de chat de ejemplo
1. «Tú tranquilo. Yo vigilo.»
2. «Hoy hace calor del bueno. Me gusta.»
3. «¿Un día malo? Ponte detrás de mí. Aquí no pasa nadie.»

## Brief de arte
Pixel art en 3/4. Coraza en primario (lleva el patrón), franjas de placa y chimeneas en primario oscurecido, grietas, panza y llamas en secundario. La cola gira con la pose y las llamas laten con los apéndices; las cuatro patas dan el paso en diagonal.

**Estado del arte:** redibujado con el generador v2 y las lecciones de diseño (`design-lessons.md`). Coraza con escamas y, en la etapa final, chimeneas y cuerno en el acento.

## Datos (`shared/game-data/species.json`)
```json
{
  "id": "magmadillo",
  "name": "Magmadillo",
  "description": "Un armadillo de coraza volcánica cuyas grietas brillan cuando se emociona. Es tranquilo y protector, y se hace una bola cuando algo le asusta.",
  "element": "fire",
  "rarity": "super_rare",
  "baseStats": { "hp": 62, "atk": 52, "def": 70, "vel": 44, "esp": 52 },
  "favoriteFood": "spicy_berry",
  "spriteKey": "magmadillo",
  "personalityBias": { "curiosity": 40, "sociability": 45, "bravery": 70, "affection": 65, "temper": 30 },
  "defaultPalette": { "primary": "#C2452D", "secondary": "#FFB627", "accent": "#5A1807" }
}
```
