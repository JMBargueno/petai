import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Filtro global de excepciones: nada que dependa de la entrada del usuario debe acabar en un 500.
 *  - Las HttpException se devuelven tal cual.
 *  - Los errores de Prisma que vienen de datos inválidos (ids con caracteres NUL, uuid mal formados,
 *    valores fuera de rango…) se traducen a 4xx.
 *  - Todo lo demás es un 500 genérico: el detalle y la traza solo van al log, nunca al cliente.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    // Respuesta ya iniciada (p. ej. un flujo SSE a medias): solo se cierra la conexión
    if (res.headersSent) {
      res.end();
      return;
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body);
      return;
    }

    const mapped = this.fromPrisma(exception);
    if (mapped) {
      res.status(mapped.status).json({ statusCode: mapped.status, message: mapped.message, error: HttpStatus[mapped.status] });
      return;
    }

    const err = exception as Error;
    this.logger.error(err?.message ?? String(exception), err?.stack);
    res.status(500).json({ statusCode: 500, message: 'Error interno del servidor' });
  }

  private fromPrisma(e: unknown): { status: number; message: string } | null {
    if (e instanceof Prisma.PrismaClientValidationError) {
      return { status: 400, message: 'Datos no válidos' };
    }
    const text = (e as any)?.message ?? '';
    // PostgreSQL no admite el byte 0x00 en cadenas: un id con %00 en la URL
    if (/invalid byte sequence|0x00|null character|\\u0000/i.test(text)) {
      return { status: 400, message: 'Datos no válidos' };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      switch (e.code) {
        case 'P2002':
          return { status: 409, message: 'El recurso ya existe' };
        case 'P2025':
          return { status: 404, message: 'Recurso no encontrado' };
        case 'P2023': // valor inconsistente (p. ej. uuid mal formado)
        case 'P2000': // valor demasiado largo para la columna
        case 'P2020':
          return { status: 400, message: 'Datos no válidos' };
        case 'P2003':
          return { status: 409, message: 'Conflicto con datos relacionados' };
      }
    }
    return null;
  }
}
