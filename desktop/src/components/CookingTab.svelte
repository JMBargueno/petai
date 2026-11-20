<script lang="ts">
  /** Jugar › Cocina en el escritorio: recetario, empezar y servir; el juego es `CookingView`, de `@pockai/ui`. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { CookingView } from '@pockai/ui';
  import { api, type CookingBuff, type CookingDailyMenu, type CookingRecipe, type CookingStart, type CookingSubmit } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';

  const dispatch = createEventDispatcher();

  export let pet: any = null;

  let menu: CookingDailyMenu | null = null;
  let book: CookingRecipe[] = [];
  let buffs: CookingBuff[] = [];
  let session: CookingStart | null = null;
  let result: CookingSubmit | null = null;
  let loadError = false;
  let error = '';
  let busy = false;

  async function load() {
    loadError = false;
    try {
      const [m, b, f] = await Promise.all([
        api.cookingDailyMenu(),
        pet ? api.cookingRecipes(pet.id) : Promise.resolve([] as CookingRecipe[]),
        pet ? api.cookingBuffs(pet.id).catch(() => [] as CookingBuff[]) : Promise.resolve([] as CookingBuff[]),
      ]);
      menu = m;
      book = b;
      buffs = f;
    } catch {
      loadError = true;
    }
  }
  onMount(load);

  async function start(recipeId?: string) {
    if (!pet) return;
    busy = true;
    error = '';
    result = null;
    try {
      session = await api.cookingStart(pet.id, recipeId);
      dispatch('refreshPet');
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo empezar a cocinar.');
    } finally {
      busy = false;
    }
  }

  async function submit(d: { sessionId: string; score: number; perfect: boolean; picked: string[]; pickedAt: number[] }) {
    busy = true;
    try {
      result = await api.cookingSubmit(d.sessionId, d.score, d.perfect, d.picked, d.pickedAt);
      dispatch('refreshUser');
      void load();
    } catch (e: any) {
      error = friendlyError(e, 'No se pudo servir el plato.');
    } finally {
      busy = false;
    }
  }

  function back() {
    session = null;
    result = null;
  }
</script>

<CookingView
  {pet}
  {menu}
  {book}
  {buffs}
  {loadError}
  {error}
  {busy}
  {session}
  {result}
  on:start={(e) => start(e.detail)}
  on:submit={(e) => submit(e.detail)}
  on:back={back}
  on:retry={load}
/>
