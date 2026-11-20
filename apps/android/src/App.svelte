<script lang="ts">
  import { onMount } from 'svelte';
  import { act, activePet, failureText, hasCore, offline, phase, signIn, signOut, start, state as core } from './core';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let message = $state('');

  const pet = $derived(activePet($core));
  const foods = $derived($core.inventory.filter((i: any) => i.item?.kind === 'food' && (i.qty ?? 0) > 0));
  const vitals = $derived(
    pet
      ? [
          { label: 'Saciedad', value: Number(pet.hunger ?? 0) },
          { label: 'Felicidad', value: Number(pet.happiness ?? 0) },
          { label: 'Energía', value: Number(pet.energy ?? 0) },
          { label: 'Higiene', value: Number(pet.hygiene ?? 0) },
        ]
      : [],
  );

  onMount(() => {
    if (hasCore()) void start().catch((e) => (message = failureText(e, 'No se pudo arrancar')));
  });

  /** Hace algo y, si falla, se lo dice al jugador. El estado lo actualiza el núcleo. */
  async function run(fallback: string, fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    message = '';
    try {
      await fn();
    } catch (e) {
      message = failureText(e, fallback);
    } finally {
      busy = false;
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    void run('No se pudo iniciar sesión', () => signIn(email.trim(), password));
  }
</script>

<main>
  {#if !hasCore()}
    <section class="card">
      <h1>Pockai</h1>
      <p>Esta pantalla es la app de Android: ábrela desde la app, no desde el navegador.</p>
    </section>
  {:else if $phase === 'starting'}
    <p class="muted" aria-live="polite">Despertando a tu Pockai…</p>
  {:else if $phase === 'signedOut'}
    <form class="card" onsubmit={submit}>
      <h1>Pockai</h1>
      <p class="muted">Conecta con tu mascota virtual</p>
      <label>
        Correo electrónico
        <input type="email" bind:value={email} autocomplete="username" inputmode="email" required />
      </label>
      <label>
        Contraseña
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      <button class="primary" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
    </form>
  {:else if $phase === 'locked'}
    <section class="card">
      <h1>Falta un paso</h1>
      <p>Verifica tu correo o elige tu nickname desde la app de escritorio para seguir.</p>
      <button type="button" onclick={() => run('No se pudo cerrar la sesión', signOut)}>Usar otra cuenta</button>
    </section>
  {:else}
    <header>
      <div>
        <strong>{$core.user?.displayName ?? $core.user?.email ?? 'Pockai'}</strong>
        <span class="muted">{$core.user?.coins ?? 0} monedas · {$core.user?.gems ?? 0} gemas</span>
      </div>
      <button type="button" onclick={() => run('No se pudo cerrar la sesión', signOut)}>Salir</button>
    </header>

    {#if $offline}
      <p class="notice" role="status">Sin conexión: esto es lo último que se guardó.</p>
    {/if}

    {#if pet}
      <section class="card">
        <h1>{pet.nickname ?? pet.species?.name ?? 'Tu Pockai'}</h1>
        <p class="muted">
          Nivel {pet.level ?? 1}{pet.sleeping ? ' · durmiendo' : ''}{pet.sick ? ' · enfermo' : ''}
        </p>
        {#each vitals as vital (vital.label)}
          <div class="vital">
            <span>{vital.label}</span>
            <progress max="100" value={vital.value} aria-label={vital.label}></progress>
            <span class="number">{Math.round(vital.value)}%</span>
          </div>
        {/each}
        <div class="actions">
          <button type="button" disabled={busy} onclick={() => run('No se pudo bañar', () => act({ type: 'clean', petId: pet.id }))}>
            Bañar
          </button>
          {#if pet.sleeping}
            <button type="button" disabled={busy} onclick={() => run('No se pudo despertar', () => act({ type: 'wake', petId: pet.id }))}>
              Despertar
            </button>
          {:else}
            <button type="button" disabled={busy} onclick={() => run('No se pudo dormir', () => act({ type: 'sleep', petId: pet.id }))}>
              Dormir
            </button>
          {/if}
        </div>
      </section>

      <section class="card">
        <h2>Alimentar</h2>
        {#if foods.length}
          <div class="actions">
            {#each foods as food (food.id ?? food.itemId)}
              <button
                type="button"
                disabled={busy}
                onclick={() => run('No se pudo dar de comer', () => act({ type: 'feed', petId: pet.id, itemId: String(food.itemId) }))}
              >
                {food.item?.name ?? food.itemId} · {food.qty}
              </button>
            {/each}
          </div>
        {:else}
          <p class="muted">No te queda comida. Compra en la tienda desde la app de escritorio.</p>
        {/if}
      </section>
    {:else}
      <section class="card">
        <h1>Sin mascota</h1>
        <p class="muted">Eclosiona un huevo para conocer a tu Pockai.</p>
      </section>
    {/if}

    {#if $core.eggs.length}
      <section class="card">
        <h2>Huevos</h2>
        <div class="actions">
          {#each $core.eggs as egg (egg.id)}
            <button type="button" disabled={busy} onclick={() => run('No se pudo eclosionar', () => act({ type: 'hatchEgg', eggId: String(egg.id) }))}>
              Eclosionar
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  {#if message}
    <p class="error" role="alert">{message}</p>
  {/if}
</main>
