<script lang="ts">
  /**
   * Salita de un Pockai: pared con cartel "Casa de …", ventana, suelo de madera y alfombra.
   * La comparten Inicio (Pockai en casa) y Social › Visitas. El escenario va en el slot por defecto;
   * el slot `overlay` queda encima de todo (pistas, botones). Es una isla de tono: colores fijos.
   * Reenvía mousedown/keydown y cualquier atributo extra (role, tabindex, aria-*) al contenedor.
   */
  /** Texto del cartel de la pared. */
  export let label: string;
  /** day = cálida, night = mascota dormida, live = visita en curso. */
  export let mood: 'day' | 'night' | 'live' = 'day';
  export let height = 168;
  export let showWindow = true;
  export let showRug = true;
  export let decor = true;
  let klass = '';
  export { klass as class };
</script>

<div
  class="home-scene mood-{mood} {klass}"
  style="--scene-h: {height}px"
  {...$$restProps}
  on:mousedown
  on:keydown
>
  <span class="sign">{label}</span>
  {#if showWindow}<span class="window" aria-hidden="true"><i></i></span>{/if}
  {#if decor}<span class="frame" aria-hidden="true">🌿</span>{/if}
  <span class="floor" aria-hidden="true"></span>
  {#if showRug}<span class="rug" aria-hidden="true"></span>{/if}
  <div class="stage"><slot /></div>
  <slot name="overlay" />
</div>

<style>
  .home-scene {
    color-scheme: light;
    position: relative;
    height: var(--scene-h);
    overflow: hidden;
    border: 1.5px solid var(--color-carbon);
    border-radius: var(--radius-2xl);
    background:
      radial-gradient(70% 60% at 50% 30%, rgb(255 236 179 / 0.9), transparent 70%),
      repeating-linear-gradient(90deg, transparent 0 22px, rgb(160 110 60 / 0.07) 22px 24px),
      linear-gradient(180deg, #fff3d6 0%, #ffe3b0 100%);
    user-select: none;
    --floor-h: min(46px, calc(var(--scene-h) * 0.3));
  }
  .mood-night {
    background:
      radial-gradient(70% 60% at 50% 30%, rgb(140 130 220 / 0.55), transparent 70%),
      repeating-linear-gradient(90deg, transparent 0 22px, rgb(30 20 80 / 0.12) 22px 24px),
      linear-gradient(180deg, #3b3570 0%, #2a2552 100%);
  }
  .mood-live {
    background:
      radial-gradient(70% 70% at 50% 20%, rgb(85 219 156 / 0.55), transparent 70%),
      linear-gradient(180deg, #e9fff4 0%, #c9f5df 100%);
  }
  .sign {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 2;
    max-width: 62%;
    padding: 3px 10px;
    border: 1.5px solid var(--color-carbon);
    border-radius: var(--radius-pills);
    background: var(--color-sunburst);
    box-shadow: 2px 2px 0 var(--color-carbon);
    color: var(--color-carbon);
    font-family: var(--font-display);
    font-size: 11px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .window {
    position: absolute;
    top: 12px;
    right: 14px;
    width: 46px;
    height: 46px;
    overflow: hidden;
    border: 3px solid #fffaf0;
    outline: 1.5px solid var(--color-carbon);
    border-radius: 10px;
    background: linear-gradient(180deg, #8fd0ff 0%, #dceeff 100%);
  }
  .window i {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(90deg, transparent calc(50% - 1.5px), #fffaf0 calc(50% - 1.5px) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
      linear-gradient(0deg, transparent calc(50% - 1.5px), #fffaf0 calc(50% - 1.5px) calc(50% + 1.5px), transparent calc(50% + 1.5px));
  }
  .mood-night .window {
    background: radial-gradient(circle at 70% 30%, #fff6c8 0 5px, transparent 6px), linear-gradient(180deg, #1b1846 0%, #3a2f7a 100%);
  }
  .frame {
    position: absolute;
    top: 50px;
    left: 18px;
    font-size: 20px;
    opacity: 0.85;
  }
  .floor {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--floor-h);
    border-top: 1.5px solid var(--color-carbon);
    background:
      repeating-linear-gradient(90deg, transparent 0 38px, rgb(0 0 0 / 0.12) 38px 40px),
      linear-gradient(180deg, #c98a4b 0%, #a86a33 100%);
  }
  .mood-night .floor {
    background:
      repeating-linear-gradient(90deg, transparent 0 38px, rgb(0 0 0 / 0.18) 38px 40px),
      linear-gradient(180deg, #6b4a2c 0%, #4f361f 100%);
  }
  .rug {
    position: absolute;
    left: 50%;
    bottom: 10px;
    width: 150px;
    height: 26px;
    transform: translateX(-50%);
    border: 1.5px solid rgb(11 10 20 / 0.35);
    border-radius: 50%;
    background: radial-gradient(closest-side, #ffb3c7 0 55%, #ff8fab 56% 75%, #ffb3c7 76%);
  }
  .stage {
    position: absolute;
    left: 50%;
    bottom: 16px;
    z-index: 1;
    display: flex;
    justify-content: center;
    transform: translateX(-50%);
  }
</style>
