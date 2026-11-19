# Cosecha del Éter (`catch_food`)

- **Familia:** Juego del Santuario
- **Lugar:** la terraza del Santuario, bajo una corriente del Éter
- **Lore:** Cuando sube la marea del Éter, las corrientes sueltan éter condensado sobre el Santuario y tu Pockai sale a recogerlo antes de que se deshaga.
- **Verbo:** llevar al Pockai bajo lo que cae

## Reglas
- Caen frutos de los Seis Flujos (los de `foods.json`). Recoger uno da 1 punto.
- **Marea:** cada 15 s sube la marea de un Flujo, en un orden que sale de la semilla. Los frutos de ese Flujo valen 2 y caen con un halo.
- Cada marea trae más frutos, más deprisa y con más polvo: uno cada 0,6 s, 0,55 s y 0,5 s; polvo estático en el 15 %, 20 % y 25 % de las apariciones.
- **Racha:** cada 5 frutos seguidos sin tocar polvo, +1.
- **Polvo estático:** no quita puntos. Rompe la racha y deja al Pockai 0,75 s sin poder recoger.
- El Pockai corre a 420 px/s, igual con las flechas que siguiendo al puntero o al dedo.

**Techo.** Tras un fruto de la marea, los dos siguientes nunca lo son: tres frutos seguidos valen como mucho 4, y con la racha, 23 puntos cada 15 frutos. Con la aparición más rápida son 3,07 pt/s en el peor tramo y 126 puntos en los 45 s (2,8 pt/s). `maxScorePerSecond`: 3. Un bot que llega a todo lo alcanzable hace entre 57 y 91, con mediana de 75.

**Recompensas.** 0,4 monedas y 0,7 de experiencia por punto: unas 28 monedas en una partida normal y 36 en una muy buena. Con 75 puntos o más, 40 % de probabilidad de una Manzana Crujiente.

## Variante accesible
Los frutos caen a la mitad de velocidad y la zona de recogida es el triple de ancha.

## El Pockai
Es quien recoge: corre por la terraza (`walk`), espera quieto (`idle`), se alegra al completar una racha (`happy`) y se encoge al tocar polvo (`hit`), parpadeando mientras le dura la estática. Mira hacia donde corre.

## Fondo
La terraza del Santuario al anochecer, vista de frente. Arriba, una corriente del Éter cruza el cielo como un río de luz con hebras; en medio, cielo violeta profundo y liso, por donde caen los frutos; abajo, el 18 % inferior es el suelo de piedra de la terraza, con un farol a cada lado. Luz ambiente en la rampa neutra del Nexo (lavanda sobre el vacío del Éter). Sin rojos, amarillos ni verdes saturados: son de los frutos.

## Piezas
| Archivo | Qué es | Tamaño | Rampa | Silueta |
|---|---|---|---|---|
| `static_dust.png` | Polvo estático: un grumo de ruido del Éter | 32 | Ruido (`#1a1426` `#3d3654` `#6b6485` `#a8a2bd`, acento `#7cf5e6`) | Rota y dentada, hecha de trozos cuadrados, con huecos |
| `catch_spark.png` | Destello al recoger un fruto | 32 | Brillo cálido (`#fff1c2`, `#ffd166`, contorno `#8a5a12`) | Estrella de cuatro puntas |
| `tide_halo.png` | Halo de los frutos de la marea | 48 | Neutra del Nexo (`#f6eaff`, `#e9ccff`, contorno `#8a76b8`) | Corona de gotas, hueca en el centro |

## Reutilizado
- Frutos: `spicy_berry`, `sweet_coral`, `sun_seed`, `spark_candy`, `midnight_berry` y `dawn_honey`, de `shared/assets/items/`.
- La marea tiñe la parte alta de la arena con el tono medio de su Flujo (CSS) y enseña su fruto, con halo, en la esquina.
- Sombra de suelo del Pockai: una elipse 2:1 en CSS.

## Notas
- El polvo no puede parecer comida ni una piedra: es ruido, no un objeto.
- El halo no tapa el fruto: el centro queda hueco.
- La zona por donde caen los frutos es lisa; los faroles van pegados a los bordes.
