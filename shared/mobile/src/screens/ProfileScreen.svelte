<script lang="ts">
  /** Cuenta › Perfil: carga y guarda por el núcleo; la pantalla es la de `@pockai/ui`. */
  import { onMount } from 'svelte';
  import { query } from '@pockai/client';
  import { MyProfileView } from '@pockai/ui';
  import { act, failureText } from '../core';

  let profile = $state<any>(null);
  let achievements = $state<any[]>([]);
  let loading = $state(true);
  let error = $state('');
  let ok = $state('');
  let saving = $state(false);
  let savingPrivacy = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      const [p, list] = (await Promise.all([query({ type: 'getMyProfile' }), query({ type: 'getAchievements' })])) as [any, any];
      profile = p;
      achievements = Object.values(list?.categories ?? {}).flat() as any[];
    } catch (e) {
      error = failureText(e, 'No se pudo cargar tu perfil.');
    } finally {
      loading = false;
    }
  }

  async function saveFeatured(ids: string[]) {
    if (!profile) return;
    saving = true;
    error = '';
    ok = '';
    try {
      const res = (await act({ type: 'setFeaturedBadges', achIds: ids })) as any;
      profile = { ...profile, featuredBadges: res?.featuredBadges ?? ids };
      ok = 'Vitrina actualizada.';
    } catch (e) {
      error = failureText(e, 'No se pudo guardar la vitrina.');
    } finally {
      saving = false;
    }
  }

  /** El usuario del estado lo pone al día el núcleo (la respuesta de `PATCH /me`). */
  async function togglePrivacy() {
    if (!profile) return;
    savingPrivacy = true;
    error = '';
    ok = '';
    const next = !profile.achievementsPublic;
    try {
      await act({ type: 'updateMe', data: { achievementsPublic: next } });
      profile = { ...profile, achievementsPublic: next };
      ok = next ? 'Tus insignias y estadísticas son visibles para los demás.' : 'Tus insignias y estadísticas ahora son privadas.';
    } catch (e) {
      error = failureText(e, 'No se pudo cambiar la privacidad.');
    } finally {
      savingPrivacy = false;
    }
  }

  onMount(() => void load());
</script>

<MyProfileView
  {profile}
  {achievements}
  {loading}
  {error}
  {ok}
  {saving}
  {savingPrivacy}
  on:refresh={() => load()}
  on:saveFeatured={(e) => saveFeatured(e.detail)}
  on:togglePrivacy={togglePrivacy}
  on:dismissError={() => (error = '')}
/>
