# Spec técnica del set de iconos de interfaz

## Reglas (las comprueba `scripts/check_icons.mjs`)

| Regla | Valor | Por qué |
|---|---|---|
| ViewBox | `0 0 24 24` | Una sola retícula para todas las plataformas. |
| Trazo | `1.75` en la raíz | Peso uniforme a 16 y 20 px. |
| Terminales y uniones | `round` / `round` | Look Apple, sin puntas duras. |
| Color de trazo | `currentColor` | El icono hereda el color del texto; sirve en claro y en oscuro. |
| Relleno de fondo | `var(--icon-bg, transparent)` | Tintable desde el tema; sin fondo por defecto. |
| Acento duotone | `var(--icon-accent, currentColor)` con `fill-opacity="0.18"` | Profundidad sutil; solo en `*.duo.svg`. |
| Paleta | sin hex, sin nombres de color, sin `rgb()` | No hay colores fijos en el SVG. |
| Elementos | `path`, `circle`, `rect`, `ellipse`, `line`, `polyline`, `polygon` | Sin grupos, sin `use`, sin máscaras. |
| Metadatos | ninguno | Sin comentarios, `title`, `desc`, `style` ni clases. |
| Complejidad | ≤ 12 formas | Legible a 16 px. |
| Variantes | `outline` (inactivo) y `duo` (activo) | Cada destino tiene las dos. |

## Forma del SVG generado

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
  <!-- duo: acento primero, para que el trazo quede encima -->
  <path d="…" fill="var(--icon-accent, currentColor)" fill-opacity="0.18" stroke="none"/>
  <!-- base: contorno y fondo tintable -->
  <path d="…" fill="var(--icon-bg, transparent)"/>
</svg>
```

## Cómo se tiñe en cada cliente
- **Escritorio y web:** `color` del texto del botón; el acento toma `--icon-accent` del tema si lo define.
- **Móvil:** igual; iOS y Android heredan `currentColor` del `tab` activo.
- Si `--icon-accent` no existe, el acento cae a `currentColor` con el mismo 0,18 de opacidad.
