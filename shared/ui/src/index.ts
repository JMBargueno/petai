/**
 * @pockai/ui: componentes de interfaz de Pockai, solo presentacionales.
 *
 * Reciben datos por props y avisan con eventos: no saben nada del núcleo, del backend ni de la
 * plataforma. Los usan las UIs de escritorio, Android e iOS. Los estilos van aparte, para que cada
 * app los cargue una vez: `@pockai/ui/fonts.css`, `tokens.css`, `base.css` y `kit.css`.
 */
export { default as AsyncState } from './AsyncState.svelte';
export { default as Badge } from './Badge.svelte';
export { default as Button } from './Button.svelte';
export { default as Card } from './Card.svelte';
export { default as ConfirmDialog } from './ConfirmDialog.svelte';
export { default as CurrencyPill } from './CurrencyPill.svelte';
export { default as EmptyState } from './EmptyState.svelte';
export { default as FeatureHeader } from './FeatureHeader.svelte';
export { default as ListRow } from './ListRow.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Notice } from './Notice.svelte';
export { default as SceneBackdrop } from './SceneBackdrop.svelte';
export { default as ProgressBar } from './ProgressBar.svelte';
export { default as SectionHeader } from './SectionHeader.svelte';
export { default as Segmented } from './Segmented.svelte';
export { default as Skeleton } from './Skeleton.svelte';
export { default as Slider } from './Slider.svelte';
export { default as StatTile } from './StatTile.svelte';
export { default as Switch } from './Switch.svelte';
export { default as TileButton } from './TileButton.svelte';
export { default as Ico } from './Ico.svelte';
export { focusTrap } from './focusTrap';
export { emitUiFeedback, onUiFeedback, type UiFeedback } from './feedback';

// Piezas de dominio: pantallas enteras que solo pintan. Reciben el estado por props y avisan de lo
// que el jugador quiere hacer; quien las usa (el contenedor de cada app) habla con el núcleo.
export { default as AccountView } from './AccountView.svelte';
export { default as BondingView } from './BondingView.svelte';
export { default as BackpackView } from './BackpackView.svelte';
export { default as ChestsView } from './ChestsView.svelte';
export { default as ItemIcon } from './ItemIcon.svelte';
export { default as EggSprite } from './EggSprite.svelte';
export { default as PetMiniAvatar } from './PetMiniAvatar.svelte';
export { default as HatchView } from './HatchView.svelte';
export { default as MissionsView } from './MissionsView.svelte';
export { default as PetHomeView } from './PetHomeView.svelte';
export { default as RaidView } from './RaidView.svelte';
export { default as RedeemCodeCard } from './RedeemCodeCard.svelte';
export { default as SeasonsView } from './SeasonsView.svelte';
export { default as ShopView } from './ShopView.svelte';
export { default as SocialAvatar } from './SocialAvatar.svelte';
export { default as TournamentView } from './TournamentView.svelte';
export { default as TrainingView } from './TrainingView.svelte';
export * from './maps';
export * from './missions';
export * from './raid';
export * from './tournament';
export * from './chests';
export * from './training';
export { ITEM_ICON_SIZE, itemIcon } from './items';
