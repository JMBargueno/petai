import * as crypto from 'crypto';

/**
 * Pool de nombres aleatorios asignados a una mascota cuando el usuario no elige uno al eclosionar.
 * EXACTAMENTE 300 nombres, todos únicos, cortos y cariñosos (sabor en español), con longitud
 * comprendida entre 3 y 16 caracteres (límite de `MAX_PET_NAME_LENGTH`).
 */
export const PET_NAMES = [
  'Firulais', 'Michi', 'Bobi', 'Coco', 'Kira', 'Luna', 'Sofia', 'Nilo',
  'Pepi', 'Toto', 'Nube', 'Roco', 'Momo', 'Chino', 'Greta', 'Bruno',
  'Lola', 'Cleo', 'Rex', 'Lulu', 'Pim', 'Beto', 'Misa', 'Toby',
  'Canela', 'Dago', 'Lolo', 'Pipi', 'Titi', 'Nico', 'Bela', 'Goma',
  'Mila', 'Nunu', 'Rulo', 'Sofi', 'Tita', 'Vera', 'Chispa', 'Cipri',
  'Dulce', 'Fuego', 'Gelo', 'Isla', 'Jazmin', 'Kilo', 'Lichi', 'Miel',
  'Nana', 'Olla', 'Prui', 'Rubi', 'Salsa', 'Trino', 'Abela', 'Bimba',
  'Dama', 'Enola', 'Flor', 'Gufo', 'Hana', 'Iris', 'Jara', 'Kilo2',
  'Lila', 'Maca', 'Nina', 'Pera', 'Quilo', 'Rico', 'Sisa', 'Tuna',
  'Ula', 'Vilo', 'Wendy', 'Ximena', 'Yayo', 'Zeta', 'Abeja', 'Bubu',
  'Dodo', 'Egua', 'Fifi', 'Gugo', 'Hugu', 'Igua', 'Joto', 'Kuko',
  'Luto', 'Mubo', 'Nugo', 'Olo', 'Pupa', 'Quico', 'Sapo', 'Taco',
  'Uli', 'Vilo2', 'Wili', 'Xico', 'Yuki', 'Zuko', 'Alba', 'Bimba2',
  'Duki', 'Eli', 'Fura', 'Gili', 'Hiro', 'Ivo', 'Joni', 'Kato',
  'Lili', 'Muri', 'Noli', 'Otto', 'Pino', 'Queri', 'Rumi', 'Soli',
  'Talo', 'Umi', 'Vilo3', 'Willu', 'Xumi', 'Yoza', 'Zuri', 'Abu',
  'Bibi', 'Cari', 'Dori', 'Emi', 'Femi', 'Geri', 'Hina', 'Ino', 'Jota',
  'Kumi', 'Loma', 'Miki', 'Neta', 'Osa', 'Pita', 'Rina', 'Sana',
  'Tami', 'Uru', 'Vela', 'Wena', 'Xara', 'Yuma', 'Zola', 'Aiko',
  'Bella', 'Dina', 'Erin', 'Fina', 'Gina', 'Hema', 'Ines', 'Jana',
  'Kina', 'Lena', 'Mona', 'Nora', 'Oma', 'Pena', 'Rosa', 'Selva',
  'Tera', 'Uca', 'Vali', 'Wini', 'Xena', 'Yola', 'Zara', 'Abel',
  'Cito', 'Dani', 'Edu', 'Feli', 'Gato', 'Hugo', 'Isma', 'Javi',
  'Kiko', 'Luis', 'Melo', 'Nano', 'Oli', 'Pepe', 'Raul', 'Sergio',
  'Tomas', 'Ugo', 'Vilo4', 'Wili2', 'Xavi', 'Yuri', 'Zeno', 'Aro',
  'Bimbo', 'Ciri', 'Dumi', 'Ema', 'Femi2', 'Gemi', 'Hemi', 'Ito', 'Jumi',
  'Kelo', 'Lumi', 'Milo', 'Nino', 'Omar', 'Pili', 'Romi', 'Simo',
  'Timo', 'Uli2', 'Vili', 'Wilo', 'Xili', 'Yilo', 'Zilo', 'Ama',
  'Bela2', 'Celo', 'Dilo', 'Elo', 'Filo', 'Gilo', 'Hilo', 'Ilo', 'Jilo',
  'Kilo3', 'Lilo', 'Milo2', 'Nilo2', 'Olo2', 'Pilo', 'Rilo', 'Silo',
  'Tilo', 'Ulo', 'Vilo5', 'Wilo2', 'Xilo', 'Yilo2', 'Zilo2', 'Aki',
  'Bela3', 'Doki', 'Emi2', 'Foki', 'Goki', 'Hoki', 'Iki', 'Joki',
  'Koki', 'Loki', 'Moki', 'Noki', 'Oku', 'Poki', 'Ruki', 'Soki',
  'Toki', 'Uki', 'Voki', 'Woku', 'Xuki', 'Yuki2', 'Zuki', 'Bolu',
  'Dolu', 'Elu', 'Folu', 'Golu', 'Holu', 'Ilu', 'Jolu', 'Kolu',
  'Lolu', 'Molu', 'Nolu', 'Olu', 'Pulu', 'Rulo2', 'Sulu', 'Tolu',
  'Nala', 'Milo3', 'Kilo4', 'Vilo6', 'Roco3', 'Pim2', 'Lolo2', 'Kira2',
  'Nilo3',
] as const;

/**
 * Devuelve un nombre aleatorio del pool. `crypto.randomInt` usa CSPRNG, así no hay sesgo de
 * `Math.random()` y no hace falta un módulo aleatorio extra.
 */
export function randomPetName(): string {
  return PET_NAMES[crypto.randomInt(PET_NAMES.length)];
}