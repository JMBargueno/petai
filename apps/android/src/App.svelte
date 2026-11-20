<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Card, CurrencyPill, EmptyState, Notice, ProgressBar } from '@pockai/ui';
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
          { label: 'Saciedad', value: Number(pet.hunger ?? 0), color: 'var(--color-ember)' },
          { label: 'Felicidad', value: Number(pet.happiness ?? 0), color: 'var(--color-sunburst)' },
          { label: 'Energía', value: Number(pet.energy ?? 0), color: 'var(--color-electric-blue)' },
          { label: 'Higiene', value: Number(pet.hygiene ?? 0), color: 'var(--color-mint-pop)' },
        ]
      : [],
  );
  const status = $derived(pet ? `Nivel ${pet.level ?? 1}${pet.sleeping ? ' · durmiendo' : ''}${pet.sick ? ' · enfermo' : ''}` : '');

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

<main class:centered={$phase === 'signedOut' || $phase === 'starting'}>
  {#if !hasCore()}
    <Card title="Pockai" icon="paw">
      <p>Esta pantalla es la app de Android: ábrela desde la app, no desde el navegador.</p>
    </Card>
  {:else if $phase === 'starting'}
    <p class="muted" aria-live="polite">Despertando a tu Pockai…</p>
  {:else if $phase === 'signedOut'}
    <Card variant="pop">
      <form onsubmit={submit}>
        <h1 class="display">Pockai</h1>
        <p class="muted">Conecta con tu mascota virtual</p>
        <label>
          Correo electrónico
          <input class="input" type="email" bind:value={email} autocomplete="username" inputmode="email" required />
        </label>
        <label>
          Contraseña
          <input class="input" type="password" bind:value={password} autocomplete="current-password" required />
        </label>
        <Button variant="primary" size="lg" block type="submit" loading={busy}>Entrar</Button>
      </form>
    </Card>
  {:else if $phase === 'locked'}
    <Card title="Falta un paso" icon="lock">
      <p>Verifica tu correo o elige tu nickname desde la app de escritorio para seguir.</p>
      <Button size="lg" block on:click={() => run('No se pudo cerrar la sesión', signOut)}>Usar otra cuenta</Button>
    </Card>
  {:else}
    <header>
      <strong>{$core.user?.displayName ?? $core.user?.email ?? 'Pockai'}</strong>
      <span class="wallet">
        <CurrencyPill kind="coins" amount={Number($core.user?.coins ?? 0)} />
        <CurrencyPill kind="gems" amount={Number($core.user?.gems ?? 0)} />
      </span>
      <Button variant="ghost" size="lg" icon="logout" iconOnly label="Salir" on:click={() => run('No se pudo cerrar la sesión', signOut)} />
    </header>

    {#if $offline}
      <Notice tone="warning">Sin conexión: esto es lo último que se guardó.</Notice>
    {/if}

    {#if pet}
      <Card title={pet.nickname ?? pet.species?.name ?? 'Tu Pockai'} icon="paw" hint={status}>
        <div class="vitals">
          {#each vitals as vital (vital.label)}
            <ProgressBar value={vital.value} label={vital.label} detail="{Math.round(vital.value)}%" color={vital.color} size="lg" />
          {/each}
        </div>
        <div class="actions">
          <Button size="lg" icon="bath" disabled={busy} on:click={() => run('No se pudo bañar', () => act({ type: 'clean', petId: pet.id }))}>
            Bañar
          </Button>
          {#if pet.sleeping}
            <Button size="lg" icon="sun" disabled={busy} on:click={() => run('No se pudo despertar', () => act({ type: 'wake', petId: pet.id }))}>
              Despertar
            </Button>
          {:else}
            <Button size="lg" icon="moon" disabled={busy} on:click={() => run('No se pudo dormir', () => act({ type: 'sleep', petId: pet.id }))}>
              Dormir
            </Button>
          {/if}
        </div>
      </Card>

      <Card title="Alimentar" icon="apple">
        {#if foods.length}
          <div class="actions">
            {#each foods as food (food.id ?? food.itemId)}
              <Button
                size="lg"
                disabled={busy}
                on:click={() => run('No se pudo dar de comer', () => act({ type: 'feed', petId: pet.id, itemId: String(food.itemId) }))}
              >
                {food.item?.name ?? food.itemId} · {food.qty}
              </Button>
            {/each}
          </div>
        {:else}
          <EmptyState icon="apple" title="No te queda comida" text="Compra en la tienda desde la app de escritorio." compact />
        {/if}
      </Card>
    {:else}
      <Card>
        <EmptyState icon="egg" title="Sin mascota" text="Eclosiona un huevo para conocer a tu Pockai." />
      </Card>
    {/if}

    {#if $core.eggs.length}
      <Card title="Huevos" icon="egg">
        <div class="actions">
          {#each $core.eggs as egg (egg.id)}
            <Button
              variant="primary"
              size="lg"
              disabled={busy}
              on:click={() => run('No se pudo eclosionar', () => act({ type: 'hatchEgg', eggId: String(egg.id) }))}
            >
              Eclosionar
            </Button>
          {/each}
        </div>
      </Card>
    {/if}
  {/if}

  {#if message}
    <Notice tone="error">{message}</Notice>
  {/if}
</main>
