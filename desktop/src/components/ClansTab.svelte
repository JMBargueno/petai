<script lang="ts">
  /**
   * Social › Clanes en el escritorio: la pantalla entera es `ClansView`, de `@pockai/ui`. Aquí solo
   * se le da cómo hablar con el servidor (el `api` del escritorio) y el hábitat del clan.
   */
  import { ClansView } from '@pockai/ui';
  import type { ClansApi } from '@pockai/ui/social';
  import { api } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';
  import ClanHabitat from './ClanHabitat.svelte';

  const clansApi: ClansApi = {
    getMyClan: () => api.getMyClan(),
    getClanMembers: (clanId) => api.getClanMembers(clanId),
    getMe: () => api.getMe(),
    getClanGoals: (clanId) => api.getClanGoals(clanId),
    getClanMessages: (clanId, opts) => api.getClanMessages(clanId, opts),
    createClan: (clan) => api.createClan(clan),
    joinClan: (tag) => api.joinClan(tag),
    inviteToClan: (clanId, target) => api.inviteToClan(clanId, target),
    leaveClan: () => api.leaveClan(),
    kickClanMember: (clanId, userId) => api.kickClanMember(clanId, userId),
    setClanMemberRole: (clanId, userId, role) => api.setClanMemberRole(clanId, userId, role),
    transferClanCreator: (clanId, userId) => api.transferClanCreator(clanId, userId),
    updateClan: (clanId, patch) => api.updateClan(clanId, patch),
    disbandClan: (clanId) => api.disbandClan(clanId),
    deleteClanMessage: (clanId, messageId) => api.deleteClanMessage(clanId, messageId),
    createClanGoal: (clanId, goal) => api.createClanGoal(clanId, goal),
    addClanGoalProgress: (clanId, goalId, amount) => api.addClanGoalProgress(clanId, goalId, amount),
    deleteClanGoal: (clanId, goalId) => api.deleteClanGoal(clanId, goalId),
    sendClanMessage: (clanId, body) => api.sendClanMessage(clanId, body),
    errorText: (e, fallback) => friendlyError(e, fallback),
  };
</script>

<ClansView {clansApi} habitat={ClanHabitat} />
