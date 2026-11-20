<script lang="ts">
  /** Jugar › Cocina: recetario, empezar y servir por el núcleo; el juego es la pantalla de `@pockai/ui`. */
  import { query } from '@pockai/client';
  import { CookingView } from '@pockai/ui';
  import { act, failureText } from '../core';

  /** La energía de la mascota y el saldo los pone al día el núcleo. */
  let { pet = null }: { pet?: any } = $props();

  let menu = $state<any>(null);
  let book = $state<any[]>([]);
  let buffs = $state<any[]>([]);
  let session = $state<any>(null);
  let result = $state<any>(null);
  let loadError = $state(false);
  let error = $state('');
  let busy = $state(false);
  let loadedFor = '';

  $effect(() => {
    const id = pet?.id ?? '';
    if (id !== loadedFor) {
      loadedFor = id;
      void load();
    }
  });

  async function load() {
    loadError = false;
    try {
      const petId = pet ? String(pet.id) : null;
      const [m, b, f] = await Promise.all([
        query({ type: 'cookingDailyMenu' }),
        petId ? query({ type: 'cookingRecipes', petId }) : Promise.resolve([]),
        petId ? query({ type: 'cookingBuffs', petId }).catch(() => []) : Promise.resolve([]),
      ]);
      menu = m;
      book = (b as any[]) ?? [];
      buffs = (f as any[]) ?? [];
    } catch {
      loadError = true;
    }
  }

  async function start(recipeId?: string) {
    if (!pet || busy) return;
    busy = true;
    error = '';
    result = null;
    try {
      session = await act({ type: 'cookingStart', petId: String(pet.id), recipeId: recipeId ?? null });
    } catch (e) {
      error = failureText(e, 'No se pudo empezar a cocinar.');
    } finally {
      busy = false;
    }
  }

  async function submit(d: { sessionId: string; score: number; perfect: boolean; picked: string[]; pickedAt: number[] }) {
    busy = true;
    try {
      result = await act({ type: 'cookingSubmit', sessionId: d.sessionId, score: d.score, correctOrder: d.perfect, picked: d.picked, pickedAt: d.pickedAt });
      void load();
    } catch (e) {
      error = failureText(e, 'No se pudo servir el plato.');
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
