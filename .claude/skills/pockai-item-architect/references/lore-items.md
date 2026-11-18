# Los objetos en el lore

Manda `docs/LORE.md`: el párrafo «¿Qué comen?» de §6 es la fuente, y el tema `alimento` de `shared/game-data/lore.json` es lo que la mascota sabe contar. Lo que sigue lo concreta para diseñar objetos, apoyado también en §4 (los Seis Flujos) y §9 (la vida en el Éter). Si un objeto nuevo trae lore que no cabe en ese párrafo, proponle al usuario ampliarlo; no lo cambies por tu cuenta.

## Qué es cada cosa

**Comida: éter condensado.** Un Pockai es un espíritu de datos: no come materia, repone sus **reservas de éter** (LORE §6: cuando el Custodio falta, «las reservas de éter se agotan»). La comida es éter que ha tomado forma para que la mascota pueda morderlo. Hay dos orígenes, los mismos que en los patrones de piel (LORE §3):
- **Mímesis Terrenal** (neutras): el Santuario imita la comida humana que ve a través de su Custodio. Manzana, pastel, ensalada. Formas cotidianas, sin Flujo, para cualquier especie.
- **Frutos de un Flujo**: cristalizan dentro de una de las seis corrientes y saben a ella. Cada Flujo tiene su favorita, y a una criatura de ese Flujo le sienta mejor que a nadie (sacia y alegra un 50 % más).

**Medicina: código reparador.** La enfermedad es corrupción de datos y polvo estático (LORE §6: «limpiar la estática, darle medicina reparadora»). Un remedio ordena lo que se ha roto. Es de la familia de la **Luz**, que «disipa la corrupción de datos», o de la **Planta**, que se regenera. No es un capricho: reordenar no sabe a nada bueno, y ningún Pockai lo pide por gusto.

**Evolución: un nudo del Telar.** La Forma Final es la **Apoteosis** (LORE §6), «la manifestación perfecta de su linaje». La Piedra de Evolución es un cristal del Telar de Mulberry (LORE §1): la hebra que le falta a un Pockai de nivel 50 para cerrar su forma. Es única y no tiene Flujo: toma el color de quien la usa.

**De dónde llegan.** La tienda es la despensa del Santuario. Los cofres traen lo que arrastra la corriente. Y cuando el Santuario se cierra, el Pockai «explora rincones del Éter, a veces encuentra pequeños tesoros» (LORE §9): eso es `itemFind`.

## Los Seis Flujos, para un objeto

| Flujo | Corriente (LORE §4) | A qué sabe y qué hace | Formas que encajan |
|---|---|---|---|
| Fuego | Termo-Impulso: calor de procesadores, pasión | Pica, calienta, da empuje | Bayas, guindillas, brasas, tostados |
| Agua | Flujo de Datos: calma líquida | Fresco, dulce, restaura | Corales, algas, perlas, gelatinas |
| Planta | Raíz Fractal: código vivo y paciente | Nutre despacio, cura | Semillas, brotes, raíces, hojas |
| Eléctrico | Pulso Voltaico: la chispa, los reflejos | Cosquillea, espabila | Caramelos, chispas, gominolas, piruletas |
| Sombra | Cifrado: misterio e intimidad | Dulce oscuro, sereno | Moras, setas, regaliz, frutos de noche |
| Luz | Claridad: verdad y ánimo | Dorado, limpio, anima | Mieles, néctares, rocíos, panes de luz |

La Sombra no es el mal: una comida de sombra no es venenosa ni siniestra, es reservada y dulce.

## Los objetos que ya existen

| Objeto | Origen | Frase de lore |
|---|---|---|
| Manzana Crujiente (`apple`) | Mímesis Terrenal | La primera fruta que el Santuario aprendió a imitar: sencilla y siempre a mano |
| Baya Ígnea (`spicy_berry`) | Fuego | Madura junto al calor de un procesador al límite y guarda una brasa dentro |
| Coral Glaseado (`sweet_coral`) | Agua | Crece donde el Flujo de Datos se remansa y se cubre de un glaseado de datos en calma |
| Semilla Solar (`sun_seed`) | Planta | Una semilla de la Raíz Fractal que ha pasado el día guardando luz |
| Caramelo de Chispa (`spark_candy`) | Eléctrico | Un pulso voltaico atrapado en azúcar: zumba en la lengua |
| Mora de Medianoche (`midnight_berry`) | Sombra | Solo madura sin luz, en los rincones cifrados del Éter |
| Miel de Alba (`dawn_honey`) | Luz | Claridad recogida con el primer rayo del día del Custodio |
| Pastel de Fresas (`cake`) | Mímesis Terrenal | Imita una fiesta humana: da mucha alegría y poco alimento de verdad |
| Ensalada Silvestre (`healthy_salad`) | Mímesis Terrenal | Hojas y raíces copiadas de la naturaleza: sienta bien aunque no entusiasme |
| Elixir Reparador (`medicine`) | Luz | Código reparador que deshace la corrupción de datos; amargo, pero cura |
| Piedra de Evolución (`evolution_stone`) | Telar de Mulberry | Un nudo cristalizado del Telar: la hebra que cierra la Forma Final |

## Vocabulario
- **Sí:** Éter, Flujo, Telar, Santuario, Custodio, Resonancia, Armonía Vital, hebra, cristal, corriente, reservas de éter, polvo estático, corrupción de datos, Apoteosis.
- **Con cuidado:** *Néctar* es el Néctar Cognitivo de la Chispa de Hermes (LORE §5, el Despertar). No llames «néctar» a una comida corriente; si una lo lleva, que tenga que ver con la mente.
- **No:** jerga de juego en nombres y descripciones (buff, stat, HP, XP, «+15»), marcas reales, comida con nombre de plato regional reconocible, alcohol, y nada que suene a daño o veneno: los Pockais no mueren y nadie les da algo malo a propósito.

## Cómo nombrar
Sustantivo cotidiano + apellido del Éter. El sustantivo dice qué se come; el apellido, de dónde viene.
- Por el Flujo: *Ígnea*, *Glaseado*, *Solar*, *de Chispa*, *de Medianoche*, *de Alba*.
- Por el lugar o el fenómeno: *del Telar*, *de Marea*, *de Resonancia*, *Fractal*, *del Prisma*.
- No repitas apellido dentro de un Flujo, ni sustantivo en todo el catálogo: dos «bayas» ya son muchas (hay Baya y Mora).
