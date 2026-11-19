# Lore para efectos

Fuente: `docs/LORE.md` (espejo en `web/src/app/lore/content.ts`). Cita la sección en el `lore` del EffectDef.

## Lugares y fenómenos que se pueden pintar

| Lore | Dónde | Cómo se ve |
|---|---|---|
| **Hebras del Nexo**: cada Custodio pone una hebra y los clanes las trenzan. «Las visitas entre Santuarios viajan por las hebras del Nexo.» | §8 | Hilos de luz trenzados; nudos; una hebra que sube y se pierde. |
| **El Telar** (de Mulberry): donde se cristalizan los huevos; «la Promesa del Telar», «el Hilo del Destino». | §2 | Urdimbre y trama; algo que se teje o se desteje. |
| **El Éter Digital** («La Red Viva»): por donde se mueve el Pockai cuando no está. | §9-10 | Vacío oscuro con remolino y nodos lejanos que titilan. |
| **Santuario de Bolsillo / Altar de Escritorio**: la casa del Pockai en tu pantalla. | §10 | Lo propio del escritorio: suelo, sombra y charco de luz. |
| **Rayo Cósmico** (shiny): bit-flip solar al cristalizarse. | §3 | Destello que atraviesa en diagonal y paleta invertida un instante. |
| **Patrones del Éter** (Escamas, Cristal, Galaxia, Aurora). | §3 | Texturas para el interior de un efecto: placas, facetas, estrellas, ondas. |

## Los Seis Flujos del Éter (§4) → rampa del efecto

La rampa sale de `shared/scene/src/effects/palettes.ts`, con 5 tonos (`outline`, `deep`, `mid`, `light`, `glow`) más el vacío (`void0`, `void1`). El tono medio es el color de UI del elemento (GUIA §3.6).

| Elemento | Flujo | Tono medio | Carácter para animar |
|---|---|---|---|
| fire | Termo-Impulso | `#fb4903` | Chisporrotea, sube, parpadea rápido. |
| water | Flujo de Datos | `#4da2ff` | Ondula, rodea, se derrama. |
| plant | Bio-Red / Raíz Fractal | `#55db9c` | Crece en ramas, despacio. |
| electric | Pulso Voltaico | `#ffd731` | Saltos secos, zigzag, nunca quieto. |
| shadow | Cifrado / Deep Éter | `#5c4ade` | Se cierra, se esconde, aparece por bordes. |
| light | Fibra Óptica / Claridad | `#e6dcf5` | Rayos rectos, destello, revela. |
| neutral | (hebras del Nexo) | `#e9ccff` | Rampa por defecto para elementos desconocidos. |

Un mismo efecto sirve para todos los Flujos cambiando la rampa. Si un Flujo pide otro movimiento, ramifica el dibujo con `frame.palette === FLOW_PALETTES.x`, o mejor con un parámetro del efecto, pero mantén la misma silueta.

## Efectos hechos

| id | Evento | Lore |
|---|---|---|
| `portal-nexo` | Ir de visita y volver (`visitTravel`) | §8: la clave del Nexo baja tres hebras, se trenzan en un arco, la trama se teje y se abre al Éter, y al terminar se deshilacha. |
| `portal-nexo` a ×1 | Un amigo llega a tu hábitat o se va (`habitat:visitor_joined/left` → `VisitorPet`, `visitorsShown.ts`) | §8: el mismo portal en el Flujo **del amigo** (`speciesElement`), a la medida de su mascota de 64 px. |
| `capullo-telar` | Evolución (`evolved` → `eventMap` `effect`) | §1, §6: seis hebras en espiral tejen un capullo que tapa a la mascota **mientras se re-hornea su nueva etapa**, se agrieta de luz y estalla en jirones. La forma final lleva corona. |
| `resonancia` | Subida de nivel (`level_up` → `eventMap` `effect`) | §1: ondas a ras de suelo, pulsos a los lados y un Códice que sube por detrás y se parte en destellos. Cede ante la evolución si llegan juntas. |
| `hebra-invocacion` | Invocación rápida (`petai:summon`) | §8: tu hebra baja hasta el cursor, se enrosca en un ovillo y de él brota la mascota (keyframe `sprout`); ya no se teletransporta. |
| `revelacion-densidad` | Nacimiento (`hatched {rarity, shiny, pity}`; desde el panel, `celebrateHatch` en App) | §2, §3: columna de luz con un anillo por densidad (la mítica late: «Primer Latido»). Si se cumplió la garantía, antes vibran las hebras de la **Promesa del Telar**; si es shiny, cae el **Rayo Cósmico** con la paleta invertida. Si la que nace no es la activa, la columna se alza **a su lado** en el Flujo de la recién nacida (`reactionForSiblingHatch`). Fases según `params` (`phasesFor`). |
| `altar-santuario` | Entrar en casa con el botón del panel (App `watchHabitat` + `PetView.enterAltar`) y salir por cualquier vía (`entrance = 'altar'`) | §10: pórtico de piedra con arco de dovelas, sello y runas que emerge, abre sus hojas a la luz del hogar y se hunde. El arrastre al panel conserva su animación propia (`skipAltarOnce`). |
| `descarga-calida` | Bienvenida (`welcome_back {tier}`) | §6: escarcha de hielo (rampa fija: el frío no es del Pockai) que una onda de luz del Flujo derrite en gotas; más escarcha cuanto más dura fue la ausencia. |

| `sello-logro` | Logro (`achievement {tier}`) | §7: pergamino sobre la cabeza con sello del Flujo; el marco crece por rango (común → legendario con corona). |
| `proyeccion-astral` | Arena (`battle_won/lost/defended` → `outcome`) | §7: la proyección vuelve del Coliseo y se funde; estrella si gana, franjas rotas si pierde (más el golpe `triggerHurt`), medias lunas si empata. |
| `trenza-juramento` | Juramento de clan cumplido (`clan:goal_completed` → `reactionForClanGoal`) | §8: cinco hebras de colores se trenzan en arco y se tensan. |
| `chispa-despertar` | La inteligencia cruza 200 o 500 (`watchAwakening` en PetView) | §5: la Chispa entra en la frente y uno o dos halos de runas giran. |
| `paquete-hebra` | `gift_received` (de un amigo) / `care_received` | §8: paquete (o sobre con corazón) que baja colgado de una hebra y se abre. |
| `sello-eter` | `gift_received` con `source` = `voucher` o `admin_grant` | §1: lo entrega el propio Éter: un sello cae de una grieta del vacío y se rompe en destellos del color de lo recibido (`reward`: monedas dorado, gemas cian, Pro prisma, cofre el metal de su `tier`, prenda rosa). |
| `manitas-espirituales` (menor) | El agente abre una web o lee el portapapeles (`AiTab` → `agentAction`) | §5: manitas de luz sostienen un portal web o un pergamino. |
| `glitch-animo` (menor) | `sick` | §7: franjas de interferencia a ~6 fps, sin estroboscopio. |
| `polvo-estatico` (menor) | `cleaned` | §6: chispas grises de estática en zigzag. |
| `desfragmentacion` (menor) | `slept` | §6: bloques que se ordenan en columnas y se apagan. |
| `polvo-impacto` / `estela-flujo` (menores) | Posarse tras un lanzamiento / zoomies | Polvo del escritorio y estela del Flujo, pequeños y de ≤400 ms. |
| `destello-prisma` (menor) | Shiny, cada 6 s (renderLoop) | §3: estrellitas en paleta invertida alrededor de la cabeza; complementan el brillo de la variante que la hoja horneada pinta sobre el cuerpo (`fxFrame`). |
| `clima` (ambiente) | `environmental.weather.condition` = `rain` / `snow` | Lluvia o nieve en pixel art (rampa fija) en vez del emoji; se queda mientras dure. |
| `grieta-objeto` | Un objeto del Éter sale o vuelve (reloj del pomodoro: iniciar / detener) | §2, §9: rendija con forma de ojo, borde del Flujo y vacío dentro; motas que brotan (`dir: out`) o se tragan (`in`); en su `hold` el objeto emerge o se hunde. Anclada al centro del objeto. |
| `hebra-toque` (pantalla) | El Pockai maneja un objeto del Éter a distancia (pausar / reanudar / detener) | §8: la hebra del Custodio como mano larga, en arco de la patita al objeto; su punta sigue al objeto en vivo y chispea al tocar. Primer efecto `space: screen` del escritorio. |
| `parpadeo-eter` (menor) | Acciones encadenadas más rápido que el Pockai (iniciar y detener al momento…) | §9: el Éter se traga o escupe el objeto en ≤240 ms; chispas que convergen o se abren. |

| `huevo-grietas` | Eclosión desde el panel (`ControlPanel` → `hatchProgress` shake/crack/abort → `PetView.hatchEgg`) | §1: huevo que tiembla en su fase `hold`, se agrieta con la luz del Flujo de quien nace y estalla justo antes de la revelación. Solo escritorio. |
| `confeti-codices` | `mission_completed {dailyCompleted: true}` | §1: lluvia de rombos-Códice (spec 01). |
| `cofre-tier` | `chest_opened {type, bestTier}` (`bestTier` lo añade el backend) | §2: cofre del metal de su tipo; columna del color del mejor drop con un destello por rango (spec 02). |
| `destello-ritual` (menor) | `ritual_completed` | §9: anillo de luz de 1 s y motas (spec 30). |
| `triunfo-raid` | `raid_victory {theme, element, gems}` (evento nuevo, `RaidService.settle`) | §4: el jefe en el Flujo de SU elemento se resquebraja; corona de laurel para el Pockai (spec 13). |

## Ideas pendientes (propón desde aquí)

| Evento (código) | Idea |
|---|---|
| Subida de bonding (`bonding_up {tier}`) | Hilo del Destino que une al Pockai con el cursor (§2). |
| Torneo ganado (`tournament_win`) | Estandarte del Coliseo (§7). |
| Aventura completada (`adventure {result}`) | Mapa que se despliega con la ruta del Éter (§9). |
| Cocinar (`cooked`) | Vapor del Flujo que sube de la olla. |
