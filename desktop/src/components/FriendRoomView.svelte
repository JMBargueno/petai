<script lang="ts">
  /** La sala del amigo vive en `@pockai/ui`; aquí se le da cómo traerla y la sala del escritorio (clima y paisaje). */
  import { FriendRoomView } from '@pockai/ui';
  import type { ClipCue } from '@pockai/ui/social';
  import { api } from '../lib/api';
  import { friendlyError } from '../lib/ui/errors';
  import IsoRoomView from './IsoRoomView.svelte';

  export let ownerId: string;
  export let ownerName = '';
  export let clipCue: ClipCue | null = null;
</script>

<FriendRoomView {ownerId} {ownerName} {clipCue} loadRoom={(id) => api.getVisitRoom(id)} errorText={friendlyError} roomView={IsoRoomView} />
