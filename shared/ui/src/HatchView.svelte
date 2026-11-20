<script lang="ts">
  /**
   * Eclosión: huevos en incubación, nombre opcional, compra y anuncio del nacimiento. Solo pinta:
   * la eclosión y sus fases (`isShaking`, `isCracking`, `isHatchingOut`) las lleva el contenedor
   * de cada app, así siguen aunque el jugador cambie de pestaña a mitad.
   *
   * El huevo es el de sprites (`EggSprite`) con la animación del momento (`anim`). Una app puede
   * cambiarlo por otro dibujo en el hueco `egg`, que recibe esa misma animación.
   */
  import { createEventDispatcher } from 'svelte';
  import { rarityMeta } from './maps';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import CurrencyPill from './CurrencyPill.svelte';
  import EmptyState from './EmptyState.svelte';
  import EggSprite from './EggSprite.svelte';
  import Notice from './Notice.svelte';
  import SectionHeader from './SectionHeader.svelte';

  export let eggs: any[] = [];
  export let eggNames: Record<string, string> = {};
  export let now = Date.now();
  export let hatchingEggId: string | null = null;
  export let isShaking = false;
  export let isCracking = false;
  export let isHatchingOut = false;
  export let hatchedResult: any = null;
  /** Mascota activa ahora mismo: si la recién nacida es otra, se ofrece cambiar a ella. */
  export let activePetId: string | null = null;
  export let coins = 0;
  export let buying = false;
  /** Texto del botón para pasar a la recién nacida (el escritorio habla de sacarla al escritorio). */
  export let switchLabel: (name: string) => string = (name) => `Cambiar a ${name}`;

  type EggAnim = 'idle' | 'shake' | 'crack' | 'hatch';
  function eggAnim(id: string, hatching: string | null, out: boolean, cracking: boolean, shaking: boolean): EggAnim {
    if (hatching !== id) return 'idle';
    return out ? 'hatch' : cracking ? 'crack' : shaking ? 'shake' : 'idle';
  }

  const EGG_PRICE = 50;

  const dispatch = createEventDispatcher<{ hatch: { id: string; name?: string }; buyEgg: void; selectPet: string; dismissResult: void }>();

  /** Un huevo está listo cuando su hatchesAt ya venció (o si no lo trae, se considera listo). */
  function eggReady(egg: any, t0: number): boolean {
    const t = new Date(egg?.hatchesAt)?.getTime?.();
    return t === undefined || Number.isNaN(t) || t <= t0;
  }

  /** Texto de cuenta atrás para un huevo aún en incubación (vacío si ya está listo). */
  function eggCountdown(egg: any, t0: number): string {
    const t = new Date(egg?.hatchesAt)?.getTime?.();
    if (t === undefined || Number.isNaN(t)) return '';
    const s = Math.max(0, Math.ceil((t - t0) / 1000));
    if (s <= 0) return '';
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  const hatch = (id: string) => hatchingEggId === null && dispatch('hatch', { id, name: eggNames[id] });

  $: bornName = hatchedResult?.nickname || hatchedResult?.species?.name || 'Tu nuevo Pockai';
</script>

<div class="ui-stack">
  {#if hatchedResult}
    {@const rar = rarityMeta(hatchedResult.rarity)}
    <Notice tone="ok" icon="party" dismissible on:dismiss={() => dispatch('dismissResult')}>
      ¡Ha nacido <strong>{bornName}</strong>{#if hatchedResult.species?.name && hatchedResult.nickname}, un {hatchedResult.species.name}{/if}!
      <Badge size="sm" color={rar.color} solid>{rar.label}</Badge>
    </Notice>
    {#if activePetId && hatchedResult.id !== activePetId}
      <Card size="sm">
        <p class="ui-card__hint">Tu mascota activa sigue siendo la de antes. Puedes cambiar cuando quieras desde Mascota › Inicio.</p>
        <Button variant="primary" size="sm" icon="paw" on:click={() => { dispatch('selectPet', hatchedResult.id); dispatch('dismissResult'); }}>
          {switchLabel(bornName)}
        </Button>
      </Card>
    {/if}
  {/if}

  <SectionHeader title="Tus huevos en incubación" icon="egg" count={eggs.length} />
  {#each eggs as egg (egg.id)}
    {@const anim = eggAnim(egg.id, hatchingEggId, isHatchingOut, isCracking, isShaking)}
    <Card size="sm" class="egg-card">
      <div class="egg">
        <div class="egg-preview">
          <slot name="egg" {anim}>
            <EggSprite {anim} />
          </slot>
        </div>
        <div class="egg-info">
          <strong class="egg-type">Huevo {egg.eggType ?? ''}</strong>
          {#if hatchingEggId === egg.id}
            <Badge tone="tint" icon="xp">¡Eclosionando…!</Badge>
          {:else if eggReady(egg, now)}
            <div class="form-group">
              <label for="egg-name-{egg.id}">Nombre (opcional)</label>
              <div class="ui-inline">
                <input
                  class="input"
                  id="egg-name-{egg.id}"
                  type="text"
                  maxlength="16"
                  spellcheck="false"
                  autocomplete="off"
                  bind:value={eggNames[egg.id]}
                  placeholder="Vacío = nombre al azar"
                  on:keydown={(e) => e.key === 'Enter' && hatch(egg.id)}
                />
                <Button variant="primary" size="sm" disabled={hatchingEggId !== null} on:click={() => hatch(egg.id)}>Eclosionar</Button>
              </div>
              <small class="form-hint count">{(eggNames[egg.id] ?? '').length}/16</small>
            </div>
          {:else}
            <Badge icon="wait">Incubando · faltan {eggCountdown(egg, now)}</Badge>
          {/if}
        </div>
      </div>
    </Card>
  {:else}
    <EmptyState icon="egg" title="Sin huevos" text="Compra uno para empezar a incubarlo." />
  {/each}

  <Button block icon="egg" loading={buying} disabled={coins < EGG_PRICE} on:click={() => dispatch('buyEgg')}>
    Comprar un huevo · <CurrencyPill kind="coins" amount={EGG_PRICE} plain />
  </Button>
  {#if coins < EGG_PRICE}
    <p class="form-hint buy-hint">Te faltan {EGG_PRICE - coins} monedas. Las ganas con misiones y minijuegos.</p>
  {/if}
</div>

<style>
  .buy-hint {
    text-align: center;
  }
  .egg {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .egg-preview {
    flex-shrink: 0;
    width: 64px;
    height: 64px;
  }
  .egg-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }
  .egg-info .form-group {
    width: 100%;
  }
  .egg-type {
    font-size: var(--text-body);
  }
  .count {
    text-align: right;
  }
</style>
