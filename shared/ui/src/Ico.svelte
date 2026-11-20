<script lang="ts">
  /** Icono de interfaz de trazo (Lucide, `currentColor`). Guía artística §6: sin emoji en la UI. */
  import {
    Coins, Gem, Sparkles, Smile, Zap, Star, Flame, Trophy, Gift, Lock, LockOpen, Check, Timer, Swords,
    ScrollText, Medal, Clapperboard, ChartColumn, HeartHandshake, Bell, PartyPopper, Brain, Settings,
    Monitor, Wrench, AlarmClock, FolderOpen, FileText, MessageCircle, Layers, Pause, Play, SkipForward,
    Heart, Shield, ChevronDown, ChevronRight, Search, TriangleAlert, Megaphone, PawPrint, Snowflake,
    Hourglass, Target, RotateCw, X, House, Info, CircleAlert, CircleCheck, Leaf, Droplets, Sun, Moon,
    Circle, Egg, Gamepad2, Crown, Dices, Apple, Bath, ArrowUp, Users, ChefHat, Map, BookOpen, Skull,
    Dumbbell, ShoppingBag, Package, WandSparkles, Clock, Plus, Send, Trash2, ExternalLink, LogOut, User,
    Castle, Ghost, CircleHelp, Mountain, Utensils, Drumstick, Hand, Cookie, Volume2, VolumeX,
    CloudRain, CloudLightning, Wind, Bird, Music,
  } from 'lucide-svelte';

  const ICONS: Record<string, any> = {
    coin: Coins, gem: Gem, xp: Sparkles, smile: Smile, energy: Zap, star: Star, flame: Flame,
    trophy: Trophy, gift: Gift, lock: Lock, unlock: LockOpen, check: Check, timer: Timer,
    swords: Swords, log: ScrollText, medal: Medal, replay: Clapperboard, chart: ChartColumn,
    bond: HeartHandshake, bell: Bell, party: PartyPopper, brain: Brain, settings: Settings,
    monitor: Monitor, tool: Wrench, alarm: AlarmClock, folder: FolderOpen, note: FileText,
    chat: MessageCircle, cards: Layers, pause: Pause, play: Play, next: SkipForward, heart: Heart,
    shield: Shield, down: ChevronDown, right: ChevronRight, search: Search, warn: TriangleAlert,
    megaphone: Megaphone, paw: PawPrint, cold: Snowflake, wait: Hourglass, target: Target,
    refresh: RotateCw, x: X, home: House, info: Info, alert: CircleAlert, ok: CircleCheck,
    leaf: Leaf, water: Droplets, sun: Sun, moon: Moon, circle: Circle, egg: Egg, gamepad: Gamepad2,
    crown: Crown, dice: Dices, apple: Apple, bath: Bath, up: ArrowUp, users: Users, chef: ChefHat,
    map: Map, book: BookOpen, skull: Skull, dumbbell: Dumbbell, shop: ShoppingBag, package: Package,
    magic: WandSparkles, clock: Clock, plus: Plus, send: Send, trash: Trash2, external: ExternalLink,
    logout: LogOut, user: User, castle: Castle, ghost: Ghost, help: CircleHelp, mountain: Mountain,
    food: Utensils, drumstick: Drumstick, hand: Hand, cookie: Cookie, volume: Volume2, mute: VolumeX,
    rain: CloudRain,
    thunder: CloudLightning,
    wind: Wind,
    bird: Bird,
    music: Music,
  };

  import { uiIconSvg } from './icons';

  /**
   * `n` es un nombre de Lucide (`chat`, `home`…) o, con prefijo `ui:`, un icono del set propio de
   * interfaz (`ui:pet`, `ui:hatch`…, ver `icons/`). El prefijo evita choques de nombre entre ambos sets.
   * `active` elige la variante duotone del set propio (Lucide no tiene variante activa).
   */
  export let n: string;
  export let size = 14;
  export let active = false;

  $: uiSvg = n.startsWith('ui:') ? uiIconSvg(n.slice(3), active) : undefined;
  $: Cmp = ICONS[n] ?? Star;
</script>

{#if uiSvg}
  <span class="ico ico-ui" aria-hidden="true" style="width:{size}px;height:{size}px">{@html uiSvg}</span>
{:else}
  <span class="ico" aria-hidden="true"><svelte:component this={Cmp} {size} /></span>
{/if}

<style>
  .ico {
    display: inline-flex;
    vertical-align: -0.15em;
  }
  .ico-ui {
    vertical-align: middle;
    flex: none;
  }
  .ico-ui :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
