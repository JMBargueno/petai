import { LIFE_STAGES } from '../lore/content';

/** Etapas de la bobina, en orden (las mismas que `evolution_<especie>.json`). */
export type EvoStage = 'egg' | 'baby' | 'juvenile' | 'adult' | 'final';
export const EVO_STAGES: EvoStage[] = ['egg', 'baby', 'juvenile', 'adult', 'final'];

/** Nombre y nivel de cada etapa: los del ciclo de vida del lore ("Joven · nv 10"). */
export const EVO_STAGE_LABELS = LIFE_STAGES.map((label) => {
  const [name, level] = label.split(' · ');
  return { name, level: level ?? null };
});

/**
 * Por qué madura en cada etapa (LORE §1 los Códices Latentes, §2 la revelación de densidad y §6 la
 * Estabilización de su Forma).
 */
export const EVO_WHY: Record<EvoStage, string> = {
  egg: $localize`:@@evo.why.egg:Un Códice Latente. Se condensa en las corrientes del Éter con los restos de código que dejamos al usar la tecnología. Llega frío y comprimido: necesita tu cercanía para descomprimir su secuencia y tomar forma.`,
  baby: $localize`:@@evo.why.baby:Al eclosionar, una columna de luz revela la densidad de su linaje. Recién nacido es casi un boceto inestable de energía.`,
  juvenile: $localize`:@@evo.why.juvenile:Tus cuidados, tu cariño y lo que vive cada día estabilizan su forma. Al llegar al nivel 10, el Telar la vuelve a tejer, más compleja.`,
  adult: $localize`:@@evo.why.adult:En el nivel 25 su estructura en el Éter ya es firme: la forma de su linaje se define y asoman sus rasgos de adulto.`,
  final: $localize`:@@evo.why.final:La Apoteosis. En el nivel 50, y con una Piedra de Evolución, alcanza la manifestación perfecta de su linaje: el único salto coronado de destellos.`,
};

/** Lo que cambia en cada especie (fichas de docs/pockais, tabla «Evolución»). El huevo es igual para todas. */
export const EVO_SPECIES: Record<string, Partial<Record<EvoStage, string>>> = {
  ignisaur: {
    baby: $localize`:@@evo.ignisaur.baby:Una brasa con patas: una bolita roja, casi toda cabeza, con un botón de cuerno y una llamita en la cola.`,
    juvenile: $localize`:@@evo.ignisaur.juvenile:Aprende a embestir: ya va a cuatro patas, con un cuerno corto y las primeras llamas donde nacerá la gorguera.`,
    adult: $localize`:@@evo.ignisaur.adult:Un tricerátops joven: la gorguera granate se abre coronada de llamas y la cola acaba en maza.`,
    final: $localize`:@@evo.ignisaur.final:El que abre camino: una melena de llamas rodea la gorguera, con dos cuernos largos y una gran maza de brasas.`,
  },
  axolunar: {
    baby: $localize`:@@evo.axolunar.baby:Una gota con patitas: una bolita turquesa con dos branquias cortas y ojos enormes.`,
    juvenile: $localize`:@@evo.axolunar.juvenile:Aprende a ponerse de pie: le salen bracitos, otra branquia a cada lado y una cola de aleta.`,
    adult: $localize`:@@evo.axolunar.adult:Un ajolote hecho y derecho: tres branquias a cada lado y una gran cola de aleta puntiaguda.`,
    final: $localize`:@@evo.axolunar.final:El ajolote de la luna: más alto y esbelto, con branquias como hojas, dos cuernecillos y una media luna en la frente.`,
  },
  florabud: {
    baby: $localize`:@@evo.florabud.baby:Un capullo con patas: verde menta, acabado en punta y con una sola hojita encima.`,
    juvenile: $localize`:@@evo.florabud.juvenile:El brote se pone de pie: dos hojas en la cabeza y una hoja por cola.`,
    adult: $localize`:@@evo.florabud.adult:Empieza a florecer: un collar de pétalos rosas y dos hojas grandes en la cabeza.`,
    final: $localize`:@@evo.florabud.final:El espíritu en flor: una gran flor rosa se abre sobre su cabeza y las enredaderas le recorren los brazos.`,
  },
};
