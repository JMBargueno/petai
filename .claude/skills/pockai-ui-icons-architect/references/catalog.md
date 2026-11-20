# Catálogo de iconos de interfaz

Nombre en el set (`ui:<nombre>`) → destino en la app. Escritorio usa `NAV` de `ControlPanel.svelte`; móvil usa `config.ts`.

## Destinos de primer nivel
| Nombre | Destino | Dónde |
|---|---|---|
| `pet` | Mascota | Escritorio y móvil |
| `play` | Jugar | Escritorio y móvil |
| `chat` | Chat | Escritorio |
| `social` | Social | Escritorio |
| `progress` | Progreso | Escritorio y móvil |
| `shop` | Tienda | Escritorio y móvil |
| `settings` | Ajustes | Escritorio (engranaje) y móvil (cuenta) |
| `backpack` | Mochila | Móvil |

## Mascota
`home` (Inicio), `backpack` (Mochila), `hatch` (Eclosión), `bonding` (Vínculo), `mind` (Mente), `habitat` (Hábitat), `wardrobe` (Armario), `skills` (Habilidades), `agent` (agente en segundo plano), `feed` (alimentar).

## Jugar
`games` (Minijuegos), `arena` (Arena), `raid` (Raid), `tournament` (Torneo), `training` (Entrenamiento), `cooking` (Cocina), `adventure` (Aventura).

## Social
`profile` (Mi Perfil), `friends` (Amigos), `clans` (Clanes), `visits` (Visitas).

## Progreso
`missions` (Misiones), `seasons` (Temporada).

## Tienda
`store` (Tienda), `chests` (Cofres).

## Ajustes
`account` (Cuenta), `notifications` (Avisos), `sound` (Sonido), `desktop` (Escritorio), `about` (Acerca de).

## Reloj (watchOS, [spec 44](../../../../docs/specs/spec-44-reloj-apple-watch.md))

El reloj no tiene Lucide: todo lo que pinta sale de este set, horneado al catálogo de Xcode por
`scripts/generate-watch-assets.ts` y resuelto en Swift por `PockaiWristArt`.

| Nombre | Destino |
|---|---|
| `hunger`, `happiness`, `energy`, `hygiene`, `health` | Las cinco constantes vitales |
| `feed`, `clean`, `sleep`, `wake`, `heal`, `evolve` | Los botones de cuidar |
| `hatch` | La cuenta atrás de la eclosión (el mismo que la subsección) |
| `pet` | Cuando no hay mascota que enseñar |
| `coin`, `gem` | El monedero |

Las formas se eligieron para no chocar con las que ya había: el corazón es de `bonding`, el huevo de
`hatch` y la estrella de `skills`.

## Pendientes
- Icono propio para **Charla** en móvil: hoy usa `ui:chat`, igual que Chat.
- Las **insignias de logro** siguen con Lucide (`achievements.json`): no entran en el set.
- `coin` y `gem` existen en el set **solo para el reloj**. Web, escritorio y móvil las siguen
  pintando con Lucide (`docs/GUIA_ARTISTICA.md` §6); unificarlas es una decisión aparte, porque
  cambiaría un icono que ya se ve en producción.
