import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from './zod.pipe';

/**
 * S-10: tests del pipe de validación por endpoint. El cuerpo de error es SIEMPRE
 * `{ message: 'Datos inválidos', issues: [...] }` (nunca el payload del cliente ni el stack).
 */
const rateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  note: z.string().max(10).optional(),
});

describe('ZodPipe (S-10)', () => {
  const pipe = new ZodPipe(rateSchema);

  it('body válido → devuelve el data transformado', () => {
    expect(pipe.transform({ stars: 4, note: 'ok' })).toEqual({ stars: 4, note: 'ok' });
  });

  it('body inválido (tipo) → 400 con issues (≤10) y sin el payload del cliente', () => {
    try {
      pipe.transform({ stars: '5', note: 'demasiado largo para diez' });
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getStatus()).toBe(400);
      const body = (e as BadRequestException).getResponse() as { message: string; issues: unknown[] };
      expect(body.message).toBe('Datos inválidos');
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues.length).toBeGreaterThanOrEqual(1);
      expect(body.issues.length).toBeLessThanOrEqual(10);
      expect(JSON.stringify(body)).not.toContain('demasiado largo para diez');
    }
  });

  it('value undefined → 400 limpio (no 500)', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });

  it('esquema .strict() con campos sobrantes → 400', () => {
    const strict = new ZodPipe(z.object({ a: z.string() }).strict());
    expect(() => strict.transform({ a: 'x', b: 1 })).toThrow(BadRequestException);
  });
});