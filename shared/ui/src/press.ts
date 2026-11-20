import { getPlatform } from './platform';

/**
 * Acción `use:press`: la onda de Material 3 que nace donde toca el dedo. Solo actúa en Android; en el
 * escritorio y en iOS no hace nada (allí la pulsación es elevación u opacidad, todo en CSS).
 * El estilo de `.ui-ripple` está en styles/platform/android.css.
 */
export function press(node: HTMLElement) {
  if (getPlatform() !== 'android') return {};

  function onDown(e: PointerEvent) {
    if ((node as HTMLButtonElement).disabled) return;
    const rect = node.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    const wave = document.createElement('span');
    wave.className = 'ui-ripple';
    wave.style.width = wave.style.height = `${size}px`;
    wave.style.left = `${e.clientX - rect.left - size / 2}px`;
    wave.style.top = `${e.clientY - rect.top - size / 2}px`;
    node.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
  }

  node.addEventListener('pointerdown', onDown);
  return { destroy: () => node.removeEventListener('pointerdown', onDown) };
}
