<script lang="ts">
  /**
   * Muestrario del kit para diseñar cada componente por plataforma y tema. Solo en desarrollo:
   * las apps lo montan con `?gallery` (y `&platform=ios|android|desktop` para cambiar de modo).
   */
  import AppearancePicker from './AppearancePicker.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import ListRow from './ListRow.svelte';
  import Modal from './Modal.svelte';
  import Notice from './Notice.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import Segmented from './Segmented.svelte';
  import Switch from './Switch.svelte';
  import FeatureHeader from './FeatureHeader.svelte';
  import SectionHeader from './SectionHeader.svelte';
  import TileButton from './TileButton.svelte';
  import { resolvedAppearance } from './appearance';
  import { PLATFORMS, getPlatform } from './platform';

  let seg = 'home';
  let pill = 'all';
  let on = true;
  let off = false;
  let sheet = false;
  let confirm = false;
  let tileFire = true;
  const platform = getPlatform();

  function link(p: string) {
    const q = new URLSearchParams(location.search);
    q.set('platform', p);
    return `?${q}`;
  }
</script>

<main class="ui-gallery">
  <header class="ui-gallery__head">
    <h1 class="display">Kit</h1>
    <span class="chip">{platform} · {$resolvedAppearance.theme} · {$resolvedAppearance.scheme}</span>
  </header>
  <nav class="ui-gallery__platforms" aria-label="Plataforma">
    {#each PLATFORMS as p}
      <a class="btn btn--sm" class:btn--ink={p === platform} href={link(p)}>{p}</a>
    {/each}
  </nav>

  <FeatureHeader title="Arena" sub="Combates por turnos contra otros Pockais" icon="medal" />

  <Card title="Apariencia" icon="sun"><AppearancePicker /></Card>

  <SectionHeader title="Cuidados" icon="heart" count={3} />
  <Card variant="hero" title="Tu Pockai" icon="paw" hint="Tarjeta destacada con el color de la sección.">
    <div class="ui-tiles">
      <TileButton icon="flame" label="Fuego" color="var(--elem-fire)" bind:selected={tileFire} on:click={() => (tileFire = !tileFire)} />
      <TileButton icon="water" label="Agua" color="var(--elem-water)" sub="Nv. 3" />
      <TileButton icon="leaf" label="Planta" color="var(--elem-plant)" disabled />
    </div>
  </Card>

  <Card title="Formulario" icon="note">
    <label class="form-group">
      <span class="form-label">Nombre</span>
      <input class="input" placeholder="Ignis" />
    </label>
    <Notice tone="ok">Guardado.</Notice>
    <Notice tone="warning">Le queda poca energía.</Notice>
    <Notice tone="error" dismissible>No se pudo conectar.</Notice>
  </Card>

  <Card title="Botones" icon="star">
    <div class="ui-gallery__row">
      <Button variant="primary" icon="check">Principal</Button>
      <Button>Normal</Button>
      <Button variant="ghost">Fantasma</Button>
      <Button variant="danger">Borrar</Button>
      <Button size="sm">Pequeño</Button>
      <Button iconOnly icon="settings" label="Ajustes" />
    </div>
  </Card>

  <Card title="Navegación" icon="map">
    <Segmented
      bind:value={seg}
      options={[
        { value: 'home', label: 'Inicio', icon: 'home' },
        { value: 'chat', label: 'Charla', icon: 'chat' },
        { value: 'bond', label: 'Vínculo', icon: 'bond' },
      ]}
    />
    <Segmented
      variant="pills"
      bind:value={pill}
      options={[
        { value: 'all', label: 'Todo' },
        { value: 'food', label: 'Comida' },
        { value: 'toys', label: 'Juguetes' },
        { value: 'deco', label: 'Decoración' },
      ]}
    />
  </Card>

  <Card title="Ajustes" icon="settings">
    <div class="ui-list">
      <Switch icon="bell" label="Avisos" sub="Cuando tu Pockai te necesite" bind:checked={on} />
      <Switch icon="moon" label="No molestar" bind:checked={off} />
    </div>
  </Card>

  <Card title="Lista" icon="users">
    <div class="ui-list">
      <ListRow icon="trophy" title="Primera evolución" sub="Hace 2 días" value="+50" />
      <ListRow icon="gift" title="Cofre raro" sub="Ayer" value="×1" />
      <ListRow icon="users" title="Nuevo amigo" sub="Hoy" />
    </div>
  </Card>

  <Card title="Estado" icon="note">
    <ProgressBar value={64} max={100} />
    <Notice tone="info">Los componentes cambian por plataforma; los colores, por tema.</Notice>
  </Card>

  <Card title="Diálogos" icon="chat">
    <div class="ui-gallery__row">
      <Button on:click={() => (sheet = true)}>Abrir hoja</Button>
      <Button variant="danger" on:click={() => (confirm = true)}>Confirmar</Button>
    </div>
  </Card>

  <Modal open={sheet} title="Hoja" icon="star" on:close={() => (sheet = false)}>
    <p>En el escritorio es un diálogo; en Android e iOS, una hoja inferior.</p>
    <svelte:fragment slot="footer"><Button variant="primary" on:click={() => (sheet = false)}>Vale</Button></svelte:fragment>
  </Modal>
  <ConfirmDialog
    open={confirm}
    title="¿Soltar el objeto?"
    danger
    confirmLabel="Soltar"
    on:cancel={() => (confirm = false)}
    on:confirm={() => (confirm = false)}
  >
    <p>Lo perderás para siempre.</p>
  </ConfirmDialog>
</main>

<style>
  .ui-gallery {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 560px;
    min-height: 100dvh;
    margin: 0 auto;
    padding: var(--space-4) var(--space-4) var(--space-8);
    background: var(--bg);
    color: var(--ink);
  }
  .ui-gallery__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-4);
    border-radius: var(--radius-cards);
    background: var(--grad-hero);
  }
  .ui-gallery__head h1 {
    margin: 0;
  }
  .ui-gallery__platforms,
  .ui-gallery__row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .ui-gallery__platforms a {
    text-decoration: none;
  }
  .ui-gallery :global(.ui-seg),
  .ui-gallery :global(.ui-pills) {
    margin-bottom: var(--space-3);
  }
</style>
