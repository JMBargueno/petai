<script lang="ts">
  /**
   * Escena de la aventura diaria: el escenario por capas con el Pockai andando de izquierda a
   * derecha, dibujado con el núcleo compartido `@pockai/scene` (el mismo que incrusta Android).
   * Traduce las props a mensajes del protocolo (`setStory`) y reenvía los hitos de la escena.
   *
   * El clima real (`weather`) lo pasa cada app si lo tiene; sin él, la escena usa su propio
   * ambiente. Los sonidos van por el puerto de sonido de la biblioteca.
   *
   * Eventos: `beat` (`arrived` al llegar al centro, `reacted` al acabar la reacción y `exited` al
   * salir por la derecha), una vez cada uno por escena.
   */
  import { onDestroy, onMount, createEventDispatcher } from 'svelte';
  import { PockaiScene, parseClock, type HostMessage, type SceneEvent, type StoryBeat, type StoryState } from '@pockai/scene';
  import { uiSfxFirst } from './sound';

  export let pet: any = null;
  /** Escena en curso (`null` mientras no hay historia). */
  export let story: StoryState | null = null;
  export let label = 'Escena de la aventura';
  export let height = 300;
  /** Clima local (`weatherCode`, `temperature`, `sunrise`, `sunset`), o `null`. */
  export let weather: any = null;

  const dispatch = createEventDispatcher<{ beat: { key: string; beat: StoryBeat } }>();

  let host: HTMLDivElement;
  let scene: PockaiScene | null = null;
  let destroyed = false;

  function onEvent(e: SceneEvent) {
    if (e.type === 'storyBeat') dispatch('beat', { key: e.key, beat: e.beat });
    else if (e.type === 'error') console.warn('[StorySceneView]', e.message);
  }

  const send = (m: HostMessage) => scene?.receive(m);

  onMount(() => {
    void PockaiScene.create({ host, label, onEvent, onSound: (ids) => uiSfxFirst(ids) }).then((s) => {
      if (destroyed) return s.destroy();
      scene = s;
    });
  });
  onDestroy(() => {
    destroyed = true;
    scene?.destroy();
    scene = null;
  });

  $: speciesKey = pet?.species?.id || pet?.species?.spriteKey || 'ignisaur';
  $: if (scene && pet)
    send({
      type: 'setPet',
      pet: {
        species: speciesKey,
        stage: pet.stage ?? 'baby',
        palette: {
          primary: pet.palette?.primary ?? '#E25822',
          secondary: pet.palette?.secondary ?? '#F3C544',
        },
        pattern: pet.pattern?.id && pet.pattern.id !== 'plain' ? pet.pattern.id : null,
        visualSeed: pet.visualSeed ?? 1337,
        shiny: !!pet.shiny,
        accessories: pet.accessories ?? {},
      },
    });
  // Clima y sol reales para las escenas que no traen ambiente propio
  $: sunrise = parseClock(weather?.sunrise);
  $: sunset = parseClock(weather?.sunset);
  $: if (scene)
    send({
      type: 'setAmbience',
      weather: weather ? { code: weather.weatherCode ?? null, temperature: weather.temperature ?? null } : null,
      sun: sunrise !== null && sunset !== null ? { sunrise, sunset } : null,
    });
  $: if (scene && story) send({ type: 'setStory', story });
</script>

<div class="story-scene" style="--scene-h: {height}px" bind:this={host}></div>

<style>
  .story-scene {
    position: relative;
    width: 100%;
    height: var(--scene-h);
    overflow: hidden;
    border-radius: var(--radius-cards);
    background: var(--surface-2, #15141f);
  }
  .story-scene :global(canvas:focus-visible) {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }
</style>
