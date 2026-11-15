import { describe, it, expect } from 'vitest';
import { calculatePerchTarget, type ActiveWindowInfo } from './windowPerching';

describe('windowPerching', () => {
  it('calcula la posición para posarse sobre la barra de título de la ventana', () => {
    const mockWindow: ActiveWindowInfo = {
      x: 100,
      y: 200,
      w: 800,
      h: 600,
      title: 'Visual Studio Code',
      is_valid: true,
    };

    const target = calculatePerchTarget(mockWindow, 128);

    // X debe estar dentro de los límites de la ventana
    expect(target.x).toBeGreaterThanOrEqual(mockWindow.x);
    expect(target.x).toBeLessThanOrEqual(mockWindow.x + mockWindow.w - 128);

    // Y debe apoyar las patitas de la mascota en el borde superior de la ventana
    expect(target.y).toBe(mockWindow.y - 128 + 16);
  });
});
