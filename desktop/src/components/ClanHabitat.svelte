<script lang="ts">
  /**
   * Hábitat del Nexo: cabecera viva del clan. Capas, de atrás adelante:
   *   1. Fondo pintado del nivel (shared/assets/clan-habitat/tier-N.png) o, si falta, el diorama
   *      en código (cielo, montañas y suelo por nivel).
   *   2. Efectos que crecen con el nivel (luciérnagas, brasas, runas, rayos, aurora, estrellas fugaces).
   *   3. Hasta 5 pockais activos, uno por Custodio, paseando (lib/clan-habitat.ts).
   *   4. La información del clan (slot) y la barra de Resonancia hacia el siguiente nivel.
   * Reacciona en vivo a `clan:xp` (celebración, +XP y, al cruzar un umbral, la transformación del
   * escenario) y a `clan:goal_completed`.
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { Sparkles, X } from 'lucide-svelte';
  import PetMiniAvatar from './PetMiniAvatar.svelte';
  import { api, type ClanHabitat, type ClanHabitatResident } from '../lib/api';
  import { clanHabitatEvents, CLAN_ROLE_LABEL } from '../lib/clan-store';
  import {
    tierProgress,
    habitatTier,
    spawnWalkers,
    stepWalkers,
    celebrateAll,
    depthScale,
    groundBand,
    type Walker,
  } from '../lib/clan-habitat';

  export let clanId: string;
  /** XP conocida por la cabecera (se usa hasta que llega el hábitat). */
  export let xp = 0;
  /** Cambia para volver a sortear los residentes (botón «Actualizar» del clan). */
  export let refreshKey = 0;

  const dispatch = createEventDispatcher<{ xp: number }>();

  // Fondos pintados por nivel; si aún no existe la imagen, se usa el diorama en código.
  const PAINTED = import.meta.glob('../../../shared/assets/clan-habitat/tier-*.{png,jpg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>;
  const paintedFor = (level: number) =>
    Object.entries(PAINTED).find(([path]) => new RegExp(`/tier-${level}\\.(png|jpg|webp)$`).test(path))?.[1] ?? null;

  let habitat: ClanHabitat | null = null;
  let residents: ClanHabitatResident[] = [];
  let walkers: Walker[] = [];
  let currentXp = xp;
  $: if (!habitat) currentXp = xp;
  $: progress = tierProgress(currentXp);
  /** Nivel que se ve: durante la transformación cambia a mitad del destello. */
  let shownLevel = habitatTier(xp).level;
  $: painted = paintedFor(shownLevel);

  let selected: string | null = null;
  $: selectedResident = residents.find((r) => r.userId === selected) ?? null;
  $: selectedWalker = walkers.find((w) => w.id === selected) ?? null;

  // Reacciones
  let floats: Array<{ id: number; text: string; x: number }> = [];
  let floatId = 0;
  let levelUp: { name: string; tagline: string } | null = null;
  let flash = false;
  let shake = false;
  let goalBanner: string | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function load() {
    if (!clanId) return;
    try {
      const h = await api.getClanHabitat(clanId);
      habitat = h;
      residents = h.residents ?? [];
      currentXp = h.xp;
      shownLevel = h.tier;
      walkers = spawnWalkers(residents.map((r) => r.userId));
      selected = null;
    } catch {
      /* sin conexión o backend antiguo: la cabecera se ve sin residentes */
    }
  }

  let loadedKey: string | null = null;
  $: if (clanId && `${clanId}:${refreshKey}` !== loadedKey) {
    loadedKey = `${clanId}:${refreshKey}`;
    load();
  }

  // ── Eventos en vivo ────────────────────────────────────────────────────────
  // El store guarda el último evento: al montar se ignora para no repetir una celebración vieja.
  let lastEventN = get(clanHabitatEvents)?.n ?? 0;
  $: onHabitatEvent($clanHabitatEvents);
  function onHabitatEvent(ev: typeof $clanHabitatEvents) {
    if (!ev || ev.n === lastEventN || ev.clanId !== clanId) return;
    lastEventN = ev.n;
    if (ev.kind === 'xp') {
      currentXp = ev.xp;
      dispatch('xp', ev.xp);
      const id = ++floatId;
      floats = [...floats, { id, text: `+${ev.delta} XP`, x: 30 + Math.random() * 40 }];
      later(1800, () => (floats = floats.filter((f) => f.id !== id)));
      if (ev.leveledUp) transform(ev.tier);
      else walkers = celebrateAll(walkers, 'celebrate', 1800);
    } else {
      goalBanner = ev.title;
      walkers = celebrateAll(walkers, 'victory', 2400);
      burst(60, ['#ffd84d', '#ff8fd1', '#7ee8ff']);
      later(3200, () => (goalBanner = null));
    }
  }

  /** Subida de nivel: destello, temblor, cambio de escenario y cartela. */
  function transform(level: number) {
    const tier = habitatTier(currentXp);
    flash = true;
    shake = !reducedMotion;
    walkers = celebrateAll(walkers, 'level_up', 2600);
    burst(140, ['#ffffff', '#ffe27a', '#9ff3ff', '#c9a6ff']);
    later(650, () => (shownLevel = Math.max(level, tier.level)));
    later(1400, () => {
      flash = false;
      shake = false;
    });
    levelUp = { name: tier.name, tagline: tier.tagline };
    later(4600, () => (levelUp = null));
  }

  // ── Bucle: paseo + partículas ──────────────────────────────────────────────
  let sceneEl: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let width = 0;
  let height = 0;
  let raf: number | null = null;
  let last = 0;

  type Particle = {
    x: number; y: number; vx: number; vy: number; life: number; max: number;
    size: number; color: string; kind: 'firefly' | 'ember' | 'mote' | 'star' | 'burst' | 'shoot';
    phase: number;
  };
  let particles: Particle[] = [];

  /** Densidad de cada efecto según el nivel (crece con la Resonancia). */
  function ambientBudget(level: number) {
    const m = reducedMotion ? 0.35 : 1;
    return {
      firefly: Math.round((6 + level * 3) * m),
      ember: level >= 2 ? Math.round((4 + level * 2) * m) : 0,
      mote: level >= 3 ? Math.round((6 + level * 2) * m) : 0,
      star: level >= 4 ? Math.round((10 + (level - 4) * 18) * m) : 0,
    };
  }

  function spawn(kind: Particle['kind']): Particle {
    const w = width || 400;
    const h = height || 240;
    switch (kind) {
      case 'firefly':
        return { kind, x: Math.random() * w, y: h * (0.45 + Math.random() * 0.5), vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 6,
          life: 0, max: 4000 + Math.random() * 5000, size: 1.6 + Math.random() * 1.4, color: '#e9ff8a', phase: Math.random() * 6.28 };
      case 'ember':
        return { kind, x: w * (0.15 + Math.random() * 0.7), y: h * 0.95, vx: (Math.random() - 0.5) * 10, vy: -(14 + Math.random() * 22),
          life: 0, max: 3000 + Math.random() * 3000, size: 1.2 + Math.random() * 1.6, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a3d', phase: Math.random() * 6.28 };
      case 'mote':
        return { kind, x: Math.random() * w, y: h * (0.2 + Math.random() * 0.75), vx: 0, vy: -(4 + Math.random() * 8),
          life: 0, max: 5000 + Math.random() * 4000, size: 1 + Math.random() * 2, color: Math.random() < 0.5 ? '#9ff3ff' : '#c9a6ff', phase: Math.random() * 6.28 };
      case 'star':
        return { kind, x: Math.random() * w, y: Math.random() * h * 0.4, vx: 0, vy: 0,
          life: 0, max: 6000 + Math.random() * 8000, size: 0.8 + Math.random() * 1.2, color: '#ffffff', phase: Math.random() * 6.28 };
      case 'shoot':
        return { kind, x: Math.random() * w * 0.6, y: Math.random() * h * 0.25, vx: 220 + Math.random() * 120, vy: 70 + Math.random() * 50,
          life: 0, max: 900, size: 1.6, color: '#ffffff', phase: 0 };
      default:
        return { kind, x: w / 2, y: h / 2, vx: 0, vy: 0, life: 0, max: 1000, size: 2, color: '#fff', phase: 0 };
    }
  }

  /** Estallido de chispas desde los residentes (o el centro si no hay). */
  function burst(n: number, colors: string[]) {
    const origins = walkers.length ? walkers.map((w) => residentPos(w)) : [{ left: width / 2, top: height * 0.7 }];
    const count = reducedMotion ? Math.round(n / 4) : n;
    for (let i = 0; i < count; i++) {
      const o = origins[i % origins.length];
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 140;
      particles.push({ kind: 'burst', x: o.left, y: o.top - 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0, max: 900 + Math.random() * 900, size: 1.5 + Math.random() * 2.5, color: colors[i % colors.length], phase: 0 });
    }
  }

  function tick(time: number) {
    const dt = last ? Math.min(time - last, 100) : 16;
    last = time;

    // Paseo
    if (walkers.length) {
      const sleeping = new Set(residents.filter((r) => r.pet.sleeping).map((r) => r.userId));
      walkers = stepWalkers(walkers, dt, sleeping);
    }

    // Partículas ambientales: se reponen hasta el presupuesto del nivel
    const budget = ambientBudget(shownLevel);
    for (const kind of ['firefly', 'ember', 'mote', 'star'] as const) {
      const have = particles.reduce((n, p) => n + (p.kind === kind ? 1 : 0), 0);
      if (have < budget[kind] && Math.random() < 0.08) particles.push(spawn(kind));
    }
    if (shownLevel >= 5 && !reducedMotion && Math.random() < dt / 7000) particles.push(spawn('shoot'));

    const s = dt / 1000;
    particles = particles.filter((p) => (p.life += dt) < p.max);
    for (const p of particles) {
      if (p.kind === 'firefly') {
        p.vx += (Math.random() - 0.5) * 30 * s;
        p.vy += (Math.random() - 0.5) * 30 * s;
        p.vx = Math.max(-12, Math.min(12, p.vx));
        p.vy = Math.max(-10, Math.min(10, p.vy));
      } else if (p.kind === 'burst') {
        p.vy += 160 * s;
        p.vx *= 0.985;
      } else if (p.kind === 'ember') {
        p.vx += Math.sin((p.life + p.phase * 1000) / 400) * 6 * s;
      }
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  function draw() {
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      const t = p.life / p.max;
      let alpha = Math.min(1, t * 4, (1 - t) * 3);
      if (p.kind === 'firefly' || p.kind === 'star') alpha *= 0.45 + 0.55 * Math.abs(Math.sin(p.life / 600 + p.phase));
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.kind === 'shoot') {
        const grad = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 0.25, p.y - p.vy * 0.25);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.25, p.y - p.vy * 0.25);
        ctx.stroke();
        continue;
      }
      if (p.kind === 'firefly' || p.kind === 'mote' || p.kind === 'burst') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, alpha * 0.25);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = Math.max(0, alpha);
      }
      ctx.fillStyle = p.color;
      // Píxeles cuadrados: casa con el pixel art de los pockais
      const sz = Math.max(1, Math.round(p.size));
      ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  /** Posición en píxeles de un residente (los pies tocan la franja de suelo). */
  $: [groundTop, groundBottom] = groundBand(shownLevel);
  function residentPos(w: Walker) {
    return { left: w.x * width, top: height * (groundTop + w.y * (groundBottom - groundTop)) };
  }
  const BASE_SIZE = 84;

  let ro: ResizeObserver | null = null;
  function onVisibility() {
    if (document.hidden && raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    } else if (!document.hidden && raf === null) {
      last = 0;
      raf = requestAnimationFrame(tick);
    }
  }

  onMount(() => {
    ro = new ResizeObserver(() => {
      width = sceneEl.clientWidth;
      height = sceneEl.clientHeight;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
    });
    ro.observe(sceneEl);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    if (raf !== null) cancelAnimationFrame(raf);
    ro?.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    for (const t of timers) clearTimeout(t);
  });

  function select(userId: string) {
    selected = selected === userId ? null : userId;
  }
  const ANIM_FOR: Record<Walker['mode'], string> = { idle: 'idle', walk: 'walk', emote: 'idle', sleep: 'idle' };
</script>

<div
  class="habitat tier-{shownLevel}"
  class:painted={!!painted}
  class:shake
  bind:this={sceneEl}
  role="group"
  aria-label="Hábitat del Nexo: {progress.tier.name}"
>
  <!-- 1. Fondo -->
  {#if painted}
    <img class="backdrop" src={painted} alt="" aria-hidden="true" draggable="false" />
  {:else}
    <div class="diorama" aria-hidden="true">
      <div class="sky"></div>
      {#if shownLevel >= 5}<div class="aurora"></div>{/if}
      <div class="moon"></div>
      <svg class="ridge far" viewBox="0 0 400 100" preserveAspectRatio="none">
        <path d="M0 70 L30 48 L60 62 L95 30 L130 55 L170 38 L205 60 L245 26 L285 52 L320 40 L360 58 L400 44 L400 100 L0 100 Z" />
      </svg>
      {#if shownLevel >= 4}
        <svg class="citadel" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax meet">
          <path d="M150 100 V58 h10 V40 h6 v-8 l4 -10 l4 10 v8 h6 V58 h12 V30 h5 V18 l6 -14 l6 14 V30 h5 V58 h12 V44 h6 v-8 l4 -9 l4 9 v8 h6 V100 Z" />
          {#if shownLevel >= 5}<circle class="core" cx="203" cy="10" r="4" />{/if}
        </svg>
      {/if}
      <svg class="ridge near" viewBox="0 0 400 100" preserveAspectRatio="none">
        <path d="M0 78 L40 64 L80 72 L120 58 L170 70 L220 60 L260 72 L310 56 L350 68 L400 60 L400 100 L0 100 Z" />
      </svg>
      <div class="ground"></div>
      {#if shownLevel >= 2}
        <div class="props props-camp">
          <span class="tent l"></span><span class="tent r"></span>
          <span class="banner b1"></span><span class="banner b2"></span>
          <span class="fire"></span>
        </div>
      {/if}
      {#if shownLevel >= 3}
        <div class="props props-runes">
          <span class="rune r1"></span><span class="rune r2"></span><span class="rune r3"></span>
        </div>
      {/if}
    </div>
  {/if}
  {#if shownLevel >= 4}<div class="rays" aria-hidden="true"></div>{/if}
  <div class="vignette" aria-hidden="true"></div>

  <!-- 2. Efectos -->
  <canvas class="fx" bind:this={canvas} aria-hidden="true"></canvas>

  <!-- 3. Residentes -->
  {#each walkers as w (w.id)}
    {@const r = residents.find((x) => x.userId === w.id)}
    {#if r}
      {@const pos = residentPos(w)}
      {@const size = Math.round(BASE_SIZE * depthScale(w.y))}
      <div
        class="resident"
        class:me={r.isMe}
        class:selected={selected === w.id}
        style="left:{pos.left}px; top:{pos.top}px; z-index:{10 + Math.round(w.y * 100)}; --size:{size}px;"
      >
        <span class="shadow" aria-hidden="true"></span>
        <div class="sprite" class:flip={w.facing < 0}>
          <PetMiniAvatar
            pet={r.pet}
            {size}
            anim={ANIM_FOR[w.mode]}
            action={w.emote}
            actionKey={w.emoteKey}
            on:click={() => select(w.id)}
          />
        </div>
        {#if r.isMe}<span class="me-tag">Tú</span>{/if}
      </div>
    {/if}
  {/each}

  {#if selectedResident && selectedWalker}
    {@const pos = residentPos(selectedWalker)}
    <div
      class="card"
      class:right={pos.left > width * 0.6}
      class:left={pos.left < width * 0.4}
      style="left:{pos.left}px; top:{pos.top - BASE_SIZE * depthScale(selectedWalker.y) - 8}px;"
      role="dialog"
      aria-label="Pockai de {selectedResident.displayName}"
    >
      <button class="card-x" aria-label="Cerrar" on:click={() => (selected = null)}><X size={12} /></button>
      <strong class="card-pet">{selectedResident.pet.nickname}</strong>
      <span class="card-meta">{selectedResident.pet.species.name} · Nv. {selectedResident.pet.level}{selectedResident.pet.sleeping ? ' · dormido' : ''}</span>
      <span class="card-owner">
        {selectedResident.isMe ? 'Tu pockai' : selectedResident.displayName}{!selectedResident.isMe && selectedResident.handle ? ` · @${selectedResident.handle}` : ''}
      </span>
      <span class="card-role">{CLAN_ROLE_LABEL[selectedResident.role] ?? 'Hermano'}</span>
    </div>
  {/if}

  {#each floats as f (f.id)}
    <span class="float" style="left:{f.x}%">{f.text}</span>
  {/each}

  <!-- 4. Información del clan + Resonancia -->
  <div class="overlay">
    <slot />
  </div>

  <div class="resonance" title="{currentXp.toLocaleString()} XP de Resonancia">
    <span class="tier-name"><Sparkles size={11} /> Nv. {progress.tier.level} · {progress.tier.name}</span>
    <div class="bar" aria-hidden="true"><span style="width:{progress.percent}%"></span></div>
    <span class="tier-next">
      {#if progress.next}
        {progress.remaining.toLocaleString()} XP<span class="long"> para {progress.next.name}</span>
      {:else}
        Resonancia máxima
      {/if}
    </span>
  </div>

  {#if residents.length === 0 && habitat}
    <p class="empty">Aún no hay pockais en el Nexo. ¡Elige uno y vendrá a vivir aquí!</p>
  {/if}

  {#if flash}<div class="flash" aria-hidden="true"></div>{/if}
  {#if levelUp}
    <div class="levelup" role="status">
      <span class="lu-kicker">El Nexo despierta</span>
      <strong class="lu-name">{levelUp.name}</strong>
      <span class="lu-tag">{levelUp.tagline}</span>
    </div>
  {:else if goalBanner}
    <div class="levelup goal" role="status">
      <span class="lu-kicker">Juramento cumplido</span>
      <strong class="lu-name">{goalBanner}</strong>
    </div>
  {/if}
</div>

<style>
  .habitat {
    --sky-top: #1d2a5c;
    --sky-bottom: #5b6fb5;
    --ridge-far: #3a4a86;
    --ridge-near: #2c3a6c;
    --ground-top: #3f7a4a;
    --ground-bottom: #24502f;
    --glow: #e9ff8a;
    position: relative;
    height: 320px;
    container-type: inline-size;
    border: var(--outline);
    border-radius: var(--radius-cards);
    overflow: hidden;
    isolation: isolate;
    box-shadow: var(--shadow-pop);
    background: var(--sky-bottom);
    user-select: none;
  }
  .tier-2 { --sky-top: #2a2350; --sky-bottom: #b06a5c; --ridge-far: #5a3f6a; --ridge-near: #3f2d52; --ground-top: #5a7a3a; --ground-bottom: #34502a; }
  .tier-3 { --sky-top: #1b1f4a; --sky-bottom: #6a4fa3; --ridge-far: #45397a; --ridge-near: #2f2860; --ground-top: #3c6e5e; --ground-bottom: #22463d; --glow: #9ff3ff; }
  .tier-4 { --sky-top: #0f1a3d; --sky-bottom: #3f7fb8; --ridge-far: #2c4f7e; --ridge-near: #1f3a62; --ground-top: #3b6a7a; --ground-bottom: #1f3f4c; --glow: #9ff3ff; }
  .tier-5 { --sky-top: #070b24; --sky-bottom: #2b2f78; --ridge-far: #232a66; --ridge-near: #171c4a; --ground-top: #2f4f7a; --ground-bottom: #172848; --glow: #c9a6ff; }

  .shake { animation: shake 0.6s cubic-bezier(.36,.07,.19,.97) 2; }
  @keyframes shake {
    10%, 90% { transform: translate(-1px, 0); }
    20%, 80% { transform: translate(2px, 1px); }
    30%, 50%, 70% { transform: translate(-3px, -1px); }
    40%, 60% { transform: translate(3px, 1px); }
  }

  /* 1. Fondo */
  .backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center bottom;
    /* Se pinta más pequeño que su tamaño real: reducir con suavizado evita los dientes de sierra. */
    animation: fade-in 0.9s ease;
  }
  @keyframes fade-in { from { opacity: 0; } }
  .diorama { position: absolute; inset: 0; animation: fade-in 0.9s ease; }
  .sky {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bottom) 62%);
  }
  .moon {
    position: absolute;
    top: 14%;
    right: 12%;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #fff6d6;
    box-shadow: 0 0 24px 6px color-mix(in srgb, #fff6d6 45%, transparent);
    opacity: 0.85;
  }
  .tier-1 .moon, .tier-2 .moon { background: #ffd28a; box-shadow: 0 0 30px 10px rgba(255, 190, 120, 0.4); top: 30%; right: 18%; }
  .aurora {
    position: absolute;
    inset: -10% -20% 40% -20%;
    background:
      radial-gradient(60% 40% at 30% 40%, rgba(110, 255, 210, 0.35), transparent 70%),
      radial-gradient(50% 35% at 70% 30%, rgba(190, 120, 255, 0.35), transparent 70%);
    filter: blur(6px);
    animation: aurora 9s ease-in-out infinite alternate;
  }
  @keyframes aurora {
    from { transform: translateX(-6%) skewX(-6deg); opacity: 0.7; }
    to { transform: translateX(6%) skewX(6deg); opacity: 1; }
  }
  .ridge { position: absolute; left: 0; width: 100%; }
  .ridge.far { bottom: 34%; height: 34%; fill: var(--ridge-far); }
  .ridge.near { bottom: 30%; height: 22%; fill: var(--ridge-near); }
  .citadel { position: absolute; left: 0; bottom: 36%; width: 100%; height: 40%; fill: color-mix(in srgb, var(--ridge-near) 70%, #000); }
  .citadel .core { fill: #c9a6ff; filter: drop-shadow(0 0 6px #c9a6ff); animation: pulse 2.4s ease-in-out infinite; }
  .tier-4 .citadel path { filter: drop-shadow(0 0 3px rgba(159, 243, 255, 0.5)); }
  .ground {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 42%;
    background:
      repeating-linear-gradient(90deg, transparent 0 22px, rgba(255, 255, 255, 0.04) 22px 24px),
      linear-gradient(180deg, var(--ground-top), var(--ground-bottom));
    box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.12);
  }
  .props { position: absolute; inset: 0; pointer-events: none; }
  .tent {
    position: absolute;
    bottom: 36%;
    width: 0;
    height: 0;
    border-left: 22px solid transparent;
    border-right: 22px solid transparent;
    border-bottom: 30px solid #c0794a;
    filter: drop-shadow(0 2px 0 rgba(0, 0, 0, 0.3));
  }
  .tent.l { left: 6%; }
  .tent.r { right: 7%; border-bottom-color: #7a5aa8; }
  .banner {
    position: absolute;
    bottom: 40%;
    width: 3px;
    height: 46px;
    background: #4a3a2a;
  }
  .banner::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 3px;
    width: 16px;
    height: 22px;
    background: var(--theme-social, #ff6fa8);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
    animation: wave 2.2s ease-in-out infinite;
    transform-origin: left center;
  }
  .banner.b1 { left: 22%; }
  .banner.b2 { right: 24%; }
  .banner.b2::after { animation-delay: -1s; background: #ffd84d; }
  @keyframes wave { 50% { transform: skewY(8deg) scaleX(0.9); } }
  .fire {
    position: absolute;
    left: 50%;
    bottom: 33%;
    width: 14px;
    height: 18px;
    translate: -50% 0;
    background: radial-gradient(circle at 50% 80%, #fff3a0, #ff9a3d 45%, #ff4d2d 70%, transparent 72%);
    border-radius: 50% 50% 40% 40%;
    filter: drop-shadow(0 0 10px #ff9a3d);
    animation: flicker 0.35s ease-in-out infinite alternate;
  }
  @keyframes flicker { to { transform: scaleY(1.15) scaleX(0.9); opacity: 0.85; } }
  .rune {
    position: absolute;
    bottom: 38%;
    width: 10px;
    height: 26px;
    background: #2a2f55;
    border-radius: 3px 3px 0 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
  }
  .rune::after {
    content: '';
    position: absolute;
    inset: 6px 3px auto 3px;
    height: 10px;
    background: var(--glow);
    border-radius: 2px;
    box-shadow: 0 0 8px var(--glow);
    animation: pulse 3s ease-in-out infinite;
  }
  .rune.r1 { left: 14%; }
  .rune.r2 { left: 34%; height: 32px; }
  .rune.r2::after { animation-delay: -1s; }
  .rune.r3 { right: 15%; }
  .rune.r3::after { animation-delay: -2s; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .rays {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-conic-gradient(from 200deg at 50% -20%, rgba(255, 255, 255, 0.07) 0deg 4deg, transparent 4deg 12deg);
    mask-image: linear-gradient(180deg, black, transparent 75%);
    animation: rays 14s linear infinite alternate;
    mix-blend-mode: screen;
  }
  @keyframes rays { to { transform: rotate(4deg) scale(1.05); } }
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(120% 90% at 50% 60%, transparent 55%, rgba(5, 8, 25, 0.55));
  }

  .fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }

  /* 3. Residentes */
  .resident {
    position: absolute;
    width: var(--size);
    height: var(--size);
    translate: -50% -100%;
  }
  .resident .shadow {
    position: absolute;
    left: 50%;
    bottom: 2px;
    width: 60%;
    height: 8px;
    translate: -50% 50%;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.32);
  }
  .sprite { position: relative; }
  .sprite.flip { transform: scaleX(-1); }
  .resident :global(.pet-mini-avatar) {
    background: none !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    cursor: pointer;
  }
  .resident.selected .shadow,
  .resident.me .shadow {
    background: radial-gradient(closest-side, color-mix(in srgb, var(--glow) 55%, transparent), rgba(0, 0, 0, 0.25));
  }
  .me-tag {
    position: absolute;
    left: 50%;
    top: calc(var(--size) * 0.12);
    translate: -50% 0;
    padding: 0 5px;
    font-size: 10px;
    font-weight: 800;
    line-height: 14px;
    color: #1b1640;
    background: var(--glow);
    border-radius: 999px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .card {
    position: absolute;
    z-index: 200;
    translate: -50% -100%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 130px;
    max-width: 190px;
    padding: 6px 22px 6px 9px;
    border: var(--outline);
    border-radius: var(--radius-lg, 10px);
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-pop);
    font-size: var(--text-caption);
    animation: pop 0.18s ease-out;
  }
  .card.left { translate: -15% -100%; }
  .card.right { translate: -85% -100%; }
  @keyframes pop { from { opacity: 0; transform: translateY(4px) scale(0.96); } }
  .card-x {
    position: absolute;
    top: 3px;
    right: 3px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .card-pet { font-size: var(--text-body, 13px); overflow-wrap: anywhere; }
  .card-meta, .card-role { color: var(--ink-muted); }
  .card-owner { font-weight: 700; overflow-wrap: anywhere; }

  .float {
    position: absolute;
    top: 52%;
    z-index: 150;
    translate: -50% 0;
    font-family: var(--font-display);
    font-size: 16px;
    color: #fff6b0;
    text-shadow: 0 2px 0 #3a2a00, 0 0 10px rgba(255, 220, 90, 0.8);
    pointer-events: none;
    animation: float-up 1.8s ease-out forwards;
  }
  @keyframes float-up {
    from { opacity: 0; transform: translateY(10px) scale(0.8); }
    20% { opacity: 1; transform: translateY(0) scale(1.1); }
    to { opacity: 0; transform: translateY(-50px) scale(1); }
  }

  /* 4. Información */
  .overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    z-index: 120;
    pointer-events: none;
  }
  .overlay > :global(*) { pointer-events: auto; }
  .resonance {
    position: absolute;
    left: 8px;
    right: 8px;
    bottom: 7px;
    z-index: 120;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(8, 10, 32, 0.55);
    backdrop-filter: blur(4px);
    color: #f2f0ff;
    font-size: 11px;
    font-weight: 700;
    pointer-events: none;
  }
  .tier-name { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .tier-next { opacity: 0.8; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .bar { height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.16); overflow: hidden; }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--glow), #ffffff);
    box-shadow: 0 0 8px var(--glow);
    transition: width 0.8s cubic-bezier(.2,.8,.2,1);
  }
  @container (max-width: 560px) {
    .tier-next .long { display: none; }
  }
  @container (max-width: 300px) {
    .tier-next { display: none; }
    .resonance { grid-template-columns: auto 1fr; }
  }
  .empty {
    position: absolute;
    left: 50%;
    top: 70%;
    z-index: 100;
    translate: -50% -50%;
    margin: 0;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(8, 10, 32, 0.55);
    color: #f2f0ff;
    font-size: 11px;
    text-align: center;
  }

  /* Reacciones */
  .flash {
    position: absolute;
    inset: 0;
    z-index: 300;
    background: radial-gradient(circle at 50% 70%, #ffffff, color-mix(in srgb, var(--glow) 70%, #fff) 40%, transparent 80%);
    animation: flash 1.4s ease-out forwards;
    pointer-events: none;
  }
  @keyframes flash { 0% { opacity: 0; } 35% { opacity: 1; } 100% { opacity: 0; } }
  .levelup {
    position: absolute;
    left: 50%;
    top: 46%;
    z-index: 310;
    translate: -50% -50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 60%;
    padding: 10px 18px;
    border-radius: var(--radius-cards);
    background: linear-gradient(180deg, rgba(10, 8, 40, 0.86), rgba(30, 18, 70, 0.86));
    border: 1.5px solid color-mix(in srgb, var(--glow) 70%, transparent);
    box-shadow: 0 0 30px color-mix(in srgb, var(--glow) 45%, transparent);
    color: #fff;
    text-align: center;
    animation: banner 0.6s cubic-bezier(.2,1.4,.4,1) both;
    pointer-events: none;
  }
  @keyframes banner { from { opacity: 0; transform: scale(0.6); } }
  .lu-kicker { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--glow); font-weight: 800; }
  .lu-name { font-family: var(--font-display); font-size: 20px; text-transform: uppercase; line-height: 1.1; text-shadow: 0 0 12px var(--glow); }
  .lu-tag { font-size: 11px; opacity: 0.85; max-width: 280px; }
  .levelup.goal { --glow: #ffd84d; }

  @media (prefers-reduced-motion: reduce) {
    .aurora, .rays, .banner::after, .fire, .rune::after, .citadel .core { animation: none; }
  }
</style>
