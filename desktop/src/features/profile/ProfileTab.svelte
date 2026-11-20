<script lang="ts">
  /** Social › Mi Perfil en el escritorio: carga y guarda; la pantalla es `MyProfileView`, de `@pockai/ui`. */
  import { onMount, onDestroy } from 'svelte';
  import { MyProfileView } from '@pockai/ui';
  import { api, type Achievement, type MyProfile } from '../../lib/api';
  import { onAchievementUnlocked } from '../achievements/achievements.api';
  import { friendlyError } from '../../lib/ui/errors';

  let profile: MyProfile | null = null;
  let achievements: Achievement[] = [];
  let loading = true;
  let error = '';
  let ok = '';
  let saving = false;
  let savingPrivacy = false;
  /** La vitrina en edición no se recarga sola (se perdería lo marcado). */
  let editing = false;

  async function load() {
    loading = true;
    error = '';
    try {
      const [p, list] = await Promise.all([api.getMyProfile(), api.getAchievements()]);
      profile = p;
      achievements = Object.values(list.categories).flat();
    } catch (e: any) {
      error = friendlyError(e);
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
      const res = await api.setFeaturedBadges(ids);
      profile = { ...profile, featuredBadges: res.featuredBadges };
      ok = 'Vitrina actualizada.';
    } catch (e: any) {
      error = friendlyError(e);
    } finally {
      saving = false;
    }
  }

  async function togglePrivacy() {
    if (!profile) return;
    savingPrivacy = true;
    error = '';
    ok = '';
    const next = !profile.achievementsPublic;
    try {
      await api.updateMe({ achievementsPublic: next });
      profile = { ...profile, achievementsPublic: next };
      ok = next ? 'Tus insignias y estadísticas son visibles para los demás.' : 'Tus insignias y estadísticas ahora son privadas.';
    } catch (e: any) {
      error = friendlyError(e);
    } finally {
      savingPrivacy = false;
    }
  }

  // Un logro desbloqueado mientras el perfil está abierto se refleja al momento.
  let stopUnlocked = () => {};
  onMount(() => {
    void load();
    stopUnlocked = onAchievementUnlocked(() => {
      if (!editing) void load();
    });
  });
  onDestroy(() => stopUnlocked());
</script>

<MyProfileView
  {profile}
  {achievements}
  {loading}
  {error}
  {ok}
  {saving}
  {savingPrivacy}
  on:refresh={load}
  on:saveFeatured={(e) => saveFeatured(e.detail)}
  on:togglePrivacy={togglePrivacy}
  on:dismissError={() => (error = '')}
  on:editing={(e) => (editing = e.detail)}
/>
