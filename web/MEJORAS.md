# Mejoras para la web pública de Pockai

Propuestas para que la landing explique mejor el juego y gane en estética. Es una hoja de ruta para decidir qué hacer después, no una lista de tareas comprometidas.

## Cómo leer este documento

- **Alcance:** solo la web pública (`/es/` y `/en/`). El panel de administración queda fuera.
- **Esfuerzo:** S (horas), M (uno o dos días), L (varios días o depende de terceros).
- **Impacto:** cuánto mejora lo que un visitante entiende, siente o hace. Alto, medio o bajo.
- **De dónde sale el contenido:** siempre que se puede, de los datos reales del juego en [`shared/game-data/`](../shared/game-data/), igual que ya hacen las secciones de rarezas y especies.

> **Antes de publicar cualquier función, confirma que un jugador puede usarla hoy.** El repositorio mezcla lo terminado con lo previsto. El README raíz da por pendientes iOS, las recompensas de fin de temporada, Play Billing y las notificaciones push; el resto de funciones de este documento aparecen como incluidas, pero no he comprobado una por una que estén activas en producción. Varias propuestas llevan una nota "por confirmar" por ese motivo.

## Diagnóstico

**Lo que ya funciona**

- Identidad reconocible: papel pastel, pegatinas, titulares enormes y una mascota viva en el hero.
- La demo deja probar la eclosión y el cuidado sin instalar nada.
- Los datos son reales: probabilidades de rareza, patrones y especies salen del propio juego.
- Estática, rápida y en dos idiomas.

**Lo que falla**

| Problema | Por qué importa |
|---|---|
| Solo cuenta el núcleo del juego | La landing habla de seis cosas (eclosión, cuidado, minijuegos, Arena, IA, sincronización). El juego tiene además 33 funciones documentadas que no aparecen: misiones, cofres, logros, hábitat, temporadas, cría, raids, torneos, cocina, genes, aventura narrativa, voz, regalos, mods… |
| No enseña el producto | No hay ni una captura ni un vídeo del juego real. La escena de escritorio es una maqueta dibujada. |
| Todo pesa lo mismo | Casi todas las secciones son "titular gigante + rejilla de tarjetas". Nada destaca como lo más importante. |
| El botón principal no lleva a ningún sitio | "Descargar Pockai" baja a una sección donde todo dice "Descarga próximamente". |
| No hay motivos para confiar ni para volver | Sin precios, sin política de privacidad, sin novedades, sin comunidad. |
| Poca profundidad para buscadores | Una sola página por idioma: no puede posicionar por "combates", "cría" o por el nombre de una especie. |

## 1. Contar más y mejor las funcionalidades

Listar 33 funciones no sirve: nadie las lee. La propuesta es agruparlas en **historias que un jugador entienda**, cada una como una sección o, mejor, una página propia.

### Formato recomendado: landing corta + páginas de detalle

Mantener la home como resumen y mover el detalle a páginas prerenderizadas igual que la home: `/funciones`, `/arena`, `/ia`, `/pockais`. Cada tarjeta de la sección "Todo lo que hace" enlazaría a la suya. Así la home no crece sin control y cada tema tiene su propia URL para compartir y posicionar.

Esfuerzo M (la primera página; las siguientes S) · Impacto alto.

### 1.1 Un día con tu pockai

Una línea de tiempo vertical que hila las funciones de hábito en un relato, en lugar de explicarlas sueltas:

- **Mañana:** llegan entre 3 y 5 misiones diarias y abres un cofre.
- **Mediodía:** si fuera llueve, tu pockai lo nota (usa el clima real de tu zona) y hoy toca festividad.
- **Tarde:** cocinas una receta que le da una ventaja en combate y entrenas contra un elemento.
- **Noche:** se duerme según tu zona horaria. Si faltas unos días, al volver te cuenta qué ha pasado.

Funciones que cubre: misiones diarias y semanales, cofres, conciencia del entorno, festividades, cocina, entrenamiento elemental, rituales y "bienvenida de vuelta".
Datos: [`missions.json`](../shared/game-data/missions.json), [`recipes.json`](../shared/game-data/recipes.json) (7 recetas), [`festivals.json`](../shared/game-data/festivals.json).

Esfuerzo M · Impacto alto. Es la sección que mejor explica por qué alguien abriría el juego cada día.

### 1.2 Arena a fondo

La landing despacha los combates en una tarjeta. Merecen página propia:

- **Rueda de elementos** interactiva: quién gana a quién. Golpear con ventaja multiplica el daño por 1,5; con desventaja, por 0,67.
- **Habilidades reales:** las 14 de [`skills.json`](../shared/game-data/skills.json), filtrables por tipo (ataque, guardia, curación), con potencia y nivel de desbloqueo.
- **Tres estrategias:** agresiva, equilibrada y defensiva, y qué cambia con cada una.
- **Escalera de ligas** con su puntuación: Bronce (0), Plata (1100), Oro (1300), Platino (1500), Diamante (1700) y Mítica (1900).
- **Una repetición de ejemplo** animada: es lo más vistoso que tiene el juego y hoy no se ve en ningún sitio.
- **Juego limpio:** el servidor simula el combate y el mismo combate da siempre el mismo resultado.

Datos: `combats` en [`balance.json`](../shared/game-data/balance.json) y `skills.json`.

> Por confirmar: el juego habla de seis elementos (fuego, agua, planta, eléctrico, sombra y luz), pero hoy solo hay habilidades de fuego, agua, planta y neutras, y especies de los tres primeros. La rueda debería mostrar solo lo que existe o marcar el resto como "próximamente".

Esfuerzo M · Impacto alto. Todo el contenido existe ya en ficheros.

### 1.3 Cada pockai es único

Ampliar la sección de rarezas con lo que hace distinta a cada criatura:

- **Genes ocultos:** hasta 3 por mascota, de 6 posibles, que se revelan en los niveles 10, 25 y 50.
- **Temperamento:** Valiente, Tímido, Arribista o Curioso. Cambia cómo pelea y cómo habla.
- **Cría:** dos pockais tienen descendencia que hereda genes, con mutaciones.
- **Etapas de vida:** bebé (nivel 1), joven (10), adulto (25) y forma final (50), hasta el nivel 100.
- **Suerte asegurada:** tras 30 huevos sin una rareza alta tienes garantizado un super-raro, y tras 120, un legendario.

Datos: [`genes.json`](../shared/game-data/genes.json), `leveling` y `pity` en `balance.json`.

Idea visual: un "generador" que combine especie, patrón, paleta y rareza al pulsar un botón, para ver cuántas combinaciones salen.

Esfuerzo M · Impacto alto.

### 1.4 Una IA con memoria

Es lo que diferencia a Pockai de cualquier otro tamagotchi y ahora ocupa una tarjeta. Propuesta:

- **Los tres niveles** como escalera: charla, memoria y agente, con qué desbloquea cada uno.
- **Un chat de ejemplo guionizado** (no en vivo): el pockai recuerda algo de ayer, propone un minijuego y pide confirmación antes de crear un recordatorio.
- **Aventura narrativa:** un cuento interactivo diario con decisiones que la mascota recuerda después.
- **Voz:** cada especie con la suya (por confirmar que esté disponible).
- **Bloque de confianza**, imprescindible si se habla de IA: usas tu propia clave, se cifra en el servidor y la app solo muestra una máscara; las acciones con efecto piden confirmación; puedes ver y borrar cada recuerdo.

Esfuerzo M · Impacto alto.

### 1.5 Tu rincón

- **Hábitat decorable:** 4 habitaciones (Sala Principal, Jardín, Santuario y Cita Final) y 11 muebles que dan bonificaciones pasivas. Una vista isométrica o de cuadrícula con muebles que se colocan al pasar el cursor.
- **Logros y constelación:** 48 logros en cinco categorías (cuidado, combate, IA, colección y social) que dibujan una constelación. Las posiciones de las estrellas ya están en [`constellations.json`](../shared/game-data/constellations.json): se puede pintar la constelación real con las estrellas encendiéndose al hacer scroll.

Datos: [`habitats.json`](../shared/game-data/habitats.json), [`achievements.json`](../shared/game-data/achievements.json).

Esfuerzo M · Impacto medio.

### 1.6 Juega con otros

Hoy la web da a entender que es un juego en solitario. Reunir lo social en una sección:

- Raid semanal contra un jefe, entre todos.
- Torneos eliminatorios.
- Cuidado cooperativo y regalos entre amigos.
- Dos pockais que se hacen compañía.
- Ver combates de otros y sus mejores momentos.
- Vínculo: una barra de amistad con tu mascota que sube al interactuar.

Por confirmar función por función: es la parte del juego con más piezas recientes.

Esfuerzo M · Impacto medio.

### 1.7 Temporadas

Qué es el pase, cuántos niveles tiene (50) y cuánto cuesta (300 gemas), el tema de la temporada en curso y una cuenta atrás.

> Los datos de [`seasons.json`](../shared/game-data/seasons.json) describen temporadas de enero y febrero de 2025. Hay que actualizarlos o conectar esta sección al calendario real antes de mostrar una cuenta atrás.

Esfuerzo S · Impacto medio.

### 1.8 Para creadores y para todos

Dos bloques cortos al final de la página de funciones:

- **Creadores y desarrolladores:** mods (especies, muebles, minijuegos), API pública y webhooks, con enlace a [`docs/API.md`](../docs/API.md).
- **Para todos:** alto contraste, modo simple, minijuegos accesibles y funcionamiento sin conexión.

Esfuerzo S · Impacto bajo, pero abre el juego a dos públicos que hoy no se sienten aludidos.

## 2. Estética

Todo lo siguiente respeta las reglas del sistema: color plano, contorno negro de 1 px, radios suaves, sin sombras y sin degradados.

### 2.1 Enseñar el producto real

Lo más urgente. Capturas o un vídeo corto en bucle del escritorio y de Android, dentro de marcos dibujados con el estilo de la web (una ventana, un móvil). La maqueta actual puede quedarse como decoración, pero no sustituye a ver el juego.

Esfuerzo S si ya existen las capturas · Impacto alto.

### 2.2 Jerarquía y ritmo

- No todas las secciones a tamaño póster. Alternar dos o tres momentos "grandes" (hero, demo, Arena) con secciones de respiro más pequeñas.
- Variar la composición: ahora casi todo es titular más rejilla. Probar una sección a dos columnas con texto largo, una fila horizontal, una cita grande, una tabla.
- Reducir la altura total: once bandas son muchas para una home si el detalle pasa a páginas propias.

Esfuerzo M · Impacto alto.

### 2.3 Ilustración

- **Más especies.** Solo hay tres con sprite, y se repiten en el hero, la demo, la sección de especies y la escena de escritorio. Cada especie nueva mejora cuatro secciones a la vez.
- **Pegatinas propias por función** en lugar de los ocho iconos genéricos actuales (huevo, corazón, rayo…). Un cofre, una sartén, una espada, una constelación.
- **La cinta azul.** La referencia usa un render 3D con textura granulada; la actual es un trazo SVG plano. Encargar un render o ilustrarla con volumen, manteniendo el trazo animado como alternativa ligera.

Esfuerzo L (depende de arte) · Impacto alto.

### 2.4 Tipografía

- Decidir si se licencian **Lateral** y **Aeonik Pro**. El código ya está preparado: basta con añadir los ficheros.
- Si no, buscar un sustituto display más cercano. Bowlby One es más redondo y ancho que la referencia, y con seis letras ya llena el ancho.
- Revisar titulares largos en inglés y en móvil, donde la palabra resaltada puede partir en dos líneas.

Esfuerzo S (decisión) o L (licencias) · Impacto medio.

### 2.5 Color con significado

Ahora los seis colores se reparten sin criterio. Asignar uno por tema y mantenerlo en toda la web: Arena en azul, IA en lavanda, cuidado en ámbar, social en menta… El color pasaría a orientar además de decorar.

Revisar de paso el contraste del texto sobre Ember y sobre Violet, los dos fondos más oscuros de la paleta.

Esfuerzo S · Impacto medio.

### 2.6 Movimiento

- Tarjetas de especie que pasan a `happy` al pasar el cursor (el componente ya lo permite).
- Transición de página al navegar entre la home y las páginas de detalle.
- Poner un límite: como mucho un elemento en bucle por pantalla, sin contar el marquee. Ahora el hero tiene cinco pegatinas flotando, la mascota y la cinta a la vez.

Esfuerzo S · Impacto medio.

### 2.7 Detalles pendientes

- Logotipo y favicon definitivos (el actual es provisional).
- Imagen para compartir en redes (`og:image`), una por idioma. Ahora no hay ninguna.
- Página 404 con personalidad: un pockai dormido.
- Modo oscuro: no existe. Decidir si encaja con la identidad de "papel pastel" o descartarlo expresamente para no dejarlo a medias.

Esfuerzo S cada uno · Impacto medio (la imagen social es la más rentable).

## 3. Demo interactiva

La demo es lo mejor de la página y puede dar más:

| Mejora | Esfuerzo | Impacto |
|---|---|---|
| Compartir el pockai que te ha tocado como imagen | M | Alto: convierte la demo en difusión |
| Guardar el resultado y "reclamarlo" al instalar (por confirmar que el juego pueda aceptarlo) | L | Alto |
| Elegir entre varios huevos antes de eclosionar | S | Medio |
| Ver crecer al pockai por sus etapas al cuidarlo | M | Medio |
| Un mini-combate de ejemplo con ventaja elemental | M | Alto: enseña la Arena jugando |
| Sonido opcional al eclosionar, apagado por defecto | S | Bajo |

## 4. Conversión y confianza

- **Enlaces de descarga reales**, y detectar la plataforma para ofrecer primero la del visitante. Los enlaces se rellenan en [`src/app/site.config.ts`](src/app/site.config.ts). Esfuerzo S · Impacto alto.
- **Lista de espera para iOS** en lugar de un simple "en desarrollo". Requiere un servicio de correo y texto legal. Esfuerzo M · Impacto medio.
- **Precios claros:** qué es gratis, qué se consigue jugando, qué cuestan las gemas y el pase. Sin esto, la mención a "gemas" genera desconfianza. Esfuerzo S · Impacto alto.
- **Privacidad:** qué datos se guardan (el juego puede usar ubicación redondeada para el clima y conversaciones con la IA) y cómo borrarlos. Esfuerzo M, necesita revisión legal · Impacto alto.
- **FAQ ampliada:** requisitos, si funciona sin conexión, qué pasa con la mascota al cambiar de móvil, coste de la IA con clave propia.
- **Novedades:** un registro de cambios público da sensación de proyecto vivo.
- **Comunidad:** enlace a donde esté (por definir).

## 5. Contenido y SEO

- **Pokédex pública:** una página por especie generada desde [`species.json`](../shared/game-data/species.json), con descripción, elemento, estadísticas base y comida favorita. Crece sola con cada especie nueva. Esfuerzo M · Impacto alto.
- **Páginas por función** (ver sección 1), cada una con su título y descripción.
- **Datos estructurados de la FAQ** para que los buscadores muestren las preguntas.
- **Revisión del inglés por un nativo:** la traducción actual es correcta pero no está revisada.
- **Dominio definitivo:** `canonical`, `hreflang` y el sitemap apuntan a un marcador (`https://pockai.example`).

## 6. Técnica y calidad

- Comprobar `prefers-reduced-motion` en un navegador real. Está implementado, pero quedó sin verificar.
- Medir Core Web Vitals con usuarios reales, sobre todo en móviles modestos, donde tantas animaciones pueden pesar.
- Subconjuntos de fuentes y precarga de la tipografía del titular para evitar el salto al cargar.
- Prueba con lector de pantalla y solo teclado de la home completa y de la demo.
- Tests visuales de la landing, para que un cambio de estilos no rompa una sección sin que nadie lo note.
- Analítica que respete la privacidad y no necesite banner de cookies, para saber qué secciones se ven y si la demo se usa.
- La salida animada de los diálogos solo funciona en Chrome y Edge.

## Prioridades

**Ahora** — poco esfuerzo, mucho efecto:

| Mejora | Esfuerzo | Impacto |
|---|---|---|
| Enlaces de descarga reales y dominio definitivo | S | Alto |
| Capturas o vídeo del juego real | S | Alto |
| Imagen para compartir en redes | S | Medio |
| Sección de precios y FAQ ampliada | S | Alto |
| "Arena a fondo" (los datos ya existen) | M | Alto |

**Siguiente:**

| Mejora | Esfuerzo | Impacto |
|---|---|---|
| Páginas de detalle por función | M | Alto |
| "Un día con tu pockai" | M | Alto |
| Pokédex pública | M | Alto |
| "Una IA con memoria" con bloque de confianza | M | Alto |
| Demo: compartir resultado y mini-combate | M | Alto |
| Jerarquía y ritmo de la home | M | Alto |
| Privacidad | M | Alto |

**Más adelante:**

| Mejora | Esfuerzo | Impacto |
|---|---|---|
| Más especies y pegatinas propias | L | Alto |
| Render 3D de la cinta | L | Medio |
| Licencias tipográficas | L | Medio |
| Lista de espera de iOS, novedades y comunidad | M | Medio |
| Hábitat, logros, social y temporadas | M | Medio |

## Qué no hacer

- No anunciar funciones que un jugador no pueda usar todavía.
- No inventar cifras de jugadores, valoraciones ni testimonios.
- No añadir sombras ni degradados, ni usar el azul como color de acción.
- No dejar que una animación oculte contenido: la página debe leerse entera sin JavaScript.
- No convertir la home en un catálogo: el detalle va en páginas propias.
