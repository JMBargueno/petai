<script lang="ts">
  /**
   * Social › Clanes: la pantalla entera es `ClansView`, de `@pockai/ui`. Aquí solo se le da cómo
   * hablar con el servidor (consultas y acciones del núcleo). Sin hábitat del clan todavía: la
   * cabecera del clan se pinta sola. El chat y los objetivos llegan en vivo por el feed social.
   */
  import { query } from '@pockai/client';
  import { ClansView } from '@pockai/ui';
  import type { ClansApi } from '@pockai/ui/social';
  import { act, failureText } from '../core';

  const ask = (q: Parameters<typeof query>[0]) => query(q) as Promise<any>;
  const run = (a: Parameters<typeof act>[0]) => act(a) as Promise<any>;

  const clansApi: ClansApi = {
    async getMyClan() {
      try {
        return await ask({ type: 'myClan' });
      } catch (e) {
        // Sin clan, el servidor responde 404.
        if ((e as { status?: number })?.status === 404) return null;
        throw e;
      }
    },
    getClanMembers: (clanId) => ask({ type: 'getClanMembers', clanId }),
    getMe: () => ask({ type: 'me' }),
    getClanGoals: (clanId) => ask({ type: 'getClanGoals', clanId }),
    getClanMessages: (clanId, opts) => ask({ type: 'clanMessages', clanId, limit: opts?.limit ?? null, before: null }),
    createClan: (clan) => run({ type: 'createClan', name: clan.name, tag: clan.tag, description: clan.description ?? null }),
    joinClan: (tag) => run({ type: 'joinClan', tag }),
    inviteToClan: (clanId, target) => run({ type: 'inviteToClan', clanId, target }),
    leaveClan: () => run({ type: 'leaveClan' }),
    kickClanMember: (clanId, userId) => run({ type: 'kickClanMember', clanId, userId }),
    setClanMemberRole: (clanId, userId, role) => run({ type: 'setClanMemberRole', clanId, userId, role }),
    transferClanCreator: (clanId, userId) => run({ type: 'transferClanCreator', clanId, userId }),
    updateClan: (clanId, patch) => run({ type: 'updateClan', clanId, patch }),
    disbandClan: (clanId) => run({ type: 'disbandClan', clanId }),
    deleteClanMessage: (clanId, messageId) => run({ type: 'deleteClanMessage', clanId, messageId }),
    createClanGoal: (clanId, goal) => run({ type: 'createClanGoal', clanId, goal }),
    addClanGoalProgress: (clanId, goalId, amount) => run({ type: 'addClanGoalProgress', clanId, goalId, amount }),
    deleteClanGoal: (clanId, goalId) => run({ type: 'deleteClanGoal', clanId, goalId }),
    sendClanMessage: (clanId, body) => run({ type: 'sendClanMessage', clanId, body }),
    errorText: (e, fallback) => failureText(e, fallback ?? 'Algo ha fallado. Inténtalo de nuevo.'),
  };
</script>

<ClansView {clansApi} />
