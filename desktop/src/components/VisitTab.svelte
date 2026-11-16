<script lang="ts">
  /** Visitas (feature 021): cuidar la mascota de un amigo, visitar su hábitat en vivo y ver el historial. */
  import { onMount, createEventDispatcher } from 'svelte';
  import { api, type CoopFriend, type CoopVisitLog, type CoopVisitResult } from '../lib/api';
  import { acceptedFriends, friendPetLabel } from '../lib/visitors';

  const dispatch = createEventDispatcher();

  let friends: CoopFriend[] = [];
  let history: CoopVisitLog[] = [];
  let error = '';
  let ok = '';
  let loading = true;
  let busy = '';
  /** Amigo seleccionado (otherUserId). */
  let selected: string = '';
  /** Visita en vivo en curso: otherUserId del amigo visitado (estado local). */
  let visiting: string = '';

  $: selectedFriend = friends.find((f) => f.otherUserId === selected) ?? null;

  /** El historial no trae el nombre; se recupera de la lista de amigos si es conocido. */
  function friendName(uid: string): string {
    return friends.find((f) => f.otherUserId === uid)?.otherDisplayName ?? uid;
  }

  const ACTION_LABEL: Record<string, string> = { feed: 'Alimentar', play: 'Jugar', clean: 'Limpiar' };
  const ACTION_ICON: Record<string, string> = { feed: '🍎', play: '🎾', clean: '🧼' };

  async function load() {
    loading = true;
    error = '';
    try {
      const [fr, hist] = await Promise.all([api.getCoopFriends(), api.getCoopHistory()]);
      friends = fr;
      history = hist?.visits ?? [];
      const accepted = acceptedFriends(friends);
      if (accepted.length && !accepted.some((f) => f.otherUserId === selected)) {
        selected = accepted[0].otherUserId;
      }
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function care(action: 'feed' | 'play' | 'clean') {
    const f = selectedFriend;
    if (!f?.otherPet?.petId) return;
    busy = action;
    error = '';
    ok = '';
    try {
      const res: CoopVisitResult = await api.coopVisit({
        ownerId: f.otherUserId,
        petId: f.otherPet.petId,
        action,
      });
      ok = `${res.message} +${res.xpGained} XP`;
      await load();
      dispatch('refreshUser');
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function startVisit() {
    const f = selectedFriend;
    if (!f) return;
    busy = 'start';
    error = '';
    ok = '';
    try {
      await api.startHabitatVisit(f.otherUserId);
      visiting = f.otherUserId;
      ok = `¡Visitando el hábitat de ${f.otherDisplayName}! Su mascota aparecerá en tu pantalla. 🏡`;
      await load();
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  async function endVisit() {
    busy = 'end';
    error = '';
    ok = '';
    try {
      await api.endHabitatVisit();
      visiting = '';
      ok = 'Visita terminada. ¡Hasta la próxima! 👋';
    } catch (e: any) {
      error = e.message;
    } finally {
      busy = '';
    }
  }

  onMount(load);
</script>

{#if loading}
  <div class="empty-msg">Cargando visitas…</div>
{:else}
  {#if error}<div class="error-msg">{error}</div>{/if}
  {#if ok}<div class="ok-msg">{ok}</div>{/if}

  <div class="sec-title">Elige a un amigo</div>
  {#each friends as f (f.id)}
    <div class="friend-pick" class:selected={selected === f.otherUserId} role="button" tabindex="0"
      on:click={() => (selected = f.otherUserId)} on:keydown={(e) => e.key === 'Enter' && (selected = f.otherUserId)}>
      <span class="fp-name">{f.otherDisplayName}</span>
      <small>{f.status === 'accepted' ? friendPetLabel(f) : f.status === 'pending' ? 'Aún no sois amigos' : '—'}</small>
    </div>
  {:else}
    <div class="empty-msg">Sin amigos todavía: pida amistad en Social › Amigos.</div>
  {/each}

  {#if selectedFriend?.status === 'accepted'}
    <div class="visit-card">
      <div class="visit-head">
        <span class="visit-icon">🐾</span>
        <div>
          <span class="visit-name">{selectedFriend.otherPet?.nickname || 'La mascota'} · {selectedFriend.otherPet?.speciesName ?? ''}</span>
          <small>de {selectedFriend.otherDisplayName}</small>
        </div>
      </div>
      <div class="care-row">
        {#each ['feed', 'play', 'clean'] as a (a)}
          <button class="care" disabled={!selectedFriend.otherPet?.petId || !!busy} on:click={() => care(a as 'feed' | 'play' | 'clean')}>
            {busy === a ? '…' : `${ACTION_ICON[a]} ${ACTION_LABEL[a]}`}
          </button>
        {/each}
      </div>
      {#if visiting === selectedFriend.otherUserId}
        <button class="visit-btn end" disabled={!!busy} on:click={endVisit}>
          {busy === 'end' ? 'Terminando…' : 'Terminar visita'}
        </button>
      {:else}
        <button class="visit-btn" disabled={!!busy} on:click={startVisit}>
          {busy === 'start' ? 'Iniciando…' : '🏡 Iniciar visita'}
        </button>
      {/if}
      <small class="visit-hint">Al iniciar la visita, su mascota aparecerá en tu escritorio junto a la tuya.</small>
    </div>
  {/if}

  <div class="sec-title">Historial de visitas</div>
  <div class="hist">
    {#each history.slice(0, 15) as h (h.createdAt + h.petId + h.visitorId)}
      <div class="hist-row">
        <span class="hist-icon">{ACTION_ICON[h.action] ?? '🐾'}</span>
        <span class="hist-name">{ACTION_LABEL[h.action] ?? h.action}</span>
        <small>{friendName(h.visitorId)}</small>
        <span class="hist-xp">+{h.xpGained} XP</span>
        <small class="hist-when">{new Date(h.createdAt).toLocaleDateString()}</small>
      </div>
    {:else}
      <div class="empty-msg">Todavía no hay visitas.</div>
    {/each}
  </div>

  <button class="primary" on:click={load}>↻ Actualizar</button>
{/if}

<style>
  .empty-msg { font-size: 12px; color: var(--ink-muted); text-align: center; padding: 12px 0; }
  .error-msg { background: color-mix(in srgb, var(--danger) 20%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); padding: 8px; border-radius: var(--radius-2xl); font-size: 12px; }
  .ok-msg { font-size: 12px; color: var(--success-ink); text-align: center; background: color-mix(in srgb, var(--success) 12%, var(--surface)); border: 1px solid var(--success); border-radius: var(--radius-2xl); padding: 8px; margin: 0; }
  .sec-title { font-weight: 700; font-size: 13px; margin: 12px 0 4px; }
  .friend-pick { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); cursor: pointer; margin-bottom: 4px; }
  .friend-pick.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--surface)); }
  .fp-name { font-size: 13px; font-weight: 600; }
  .friend-pick small { font-size: 11px; color: var(--ink-muted); }
  .visit-card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--radius-2xl); background: var(--surface-2); border: 1px solid var(--line-soft); }
  .visit-head { display: flex; align-items: center; gap: 10px; }
  .visit-icon { font-size: 24px; }
  .visit-head .visit-name { display: block; font-size: 13px; font-weight: 600; }
  .visit-head small { font-size: 11px; color: var(--ink-muted); }
  .care-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .care { padding: 8px 4px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-size: 12px; font-weight: 700; background: var(--accent); color: var(--on-color); }
  .care:disabled { opacity: 0.5; cursor: not-allowed; }
  .visit-btn { padding: 9px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: linear-gradient(90deg, var(--color-electric-blue), var(--accent)); color: var(--on-color); }
  .visit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .visit-btn.end { background: color-mix(in srgb, var(--danger) 15%, var(--surface)); border: 1px solid var(--danger); color: var(--danger-ink); }
  .visit-hint { font-size: 11px; color: var(--ink-muted); margin: 0; }
  .hist { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
  .hist-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--radius-2xl); background: var(--surface-2); font-size: 12px; }
  .hist-icon { font-size: 14px; }
  .hist-name { font-weight: 600; }
  .hist-row small { font-size: 10px; color: var(--ink-muted); }
  .hist-xp { margin-left: auto; font-weight: 700; color: var(--success-ink); }
  .hist-when { margin-left: 0; }
  .primary { margin-top: 10px; padding: 8px; border: none; border-radius: var(--radius-2xl); cursor: pointer; font-weight: 700; background: var(--accent); color: var(--on-color); width: 100%; }
</style>
