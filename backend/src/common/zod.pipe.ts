import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodTypeAny } from 'zod';

/**
 * S-10: pipe de validación con zod por endpoint (opt-in).
 *
 * Se instancia por endpoint: `@Body(new ZodPipe(publishModSchema)) dto`. Valida y TRANSFORMA el
 * cuerpo (stripea campos sobrantes y aplica `default`) y devuelve el `data` tipado. Ante un error
 * responde 400 con `{ message, issues }` (la app-exception.filter ya serializa HttpException sin
 * stack). Los endpoints que no lo llevan no se ven afectados, así que no se rompen los módulos
 * aún no migrados.
 */
@Injectable()
export class ZodPipe<T = unknown> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) throw toBadRequest(result.error);
    return result.data as T;
  }
}

/** Convierte un `ZodError` → 400 con motivo + ruta de campo (no vierte el payload del cliente). */
function toBadRequest(err: ZodError): BadRequestException {
  const issues = err.issues.slice(0, 10).map((i) => ({
    field: i.path.join('.') || '(raíz)',
    message: i.message,
  }));
  return new BadRequestException({ message: 'Datos inválidos', issues });
}