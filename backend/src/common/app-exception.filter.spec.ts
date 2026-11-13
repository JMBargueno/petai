import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppExceptionFilter } from './app-exception.filter';

function run(exception: unknown, headersSent = false) {
  const res: any = { headersSent, status: jest.fn().mockReturnThis(), json: jest.fn(), end: jest.fn() };
  const host: any = { switchToHttp: () => ({ getResponse: () => res }) };
  const filter = new AppExceptionFilter();
  jest.spyOn((filter as any).logger, 'error').mockImplementation(() => undefined);
  filter.catch(exception, host);
  return { res, filter };
}

describe('AppExceptionFilter', () => {
  it('devuelve las HttpException tal cual', () => {
    const { res } = run(new NotFoundException('No existe'));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'No existe' }));
    const custom = run(new HttpException({ statusCode: 429, message: 'x', retryAfterSeconds: 9 }, 429));
    expect(custom.res.json).toHaveBeenCalledWith({ statusCode: 429, message: 'x', retryAfterSeconds: 9 });
    const str = run(new HttpException('texto', 418));
    expect(str.res.json).toHaveBeenCalledWith({ statusCode: 418, message: 'texto' });
  });

  it('traduce los errores de Prisma causados por datos inválidos a 4xx', () => {
    const known = (code: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });
    expect(run(known('P2002')).res.status).toHaveBeenCalledWith(409);
    expect(run(known('P2025')).res.status).toHaveBeenCalledWith(404);
    expect(run(known('P2023')).res.status).toHaveBeenCalledWith(400);
    expect(run(known('P2000')).res.status).toHaveBeenCalledWith(400);
    expect(run(known('P2003')).res.status).toHaveBeenCalledWith(409);
    expect(run(new Prisma.PrismaClientValidationError('mal', { clientVersion: 'test' })).res.status).toHaveBeenCalledWith(400);
  });

  it('un byte NUL en una cadena es un 400', () => {
    const e = new Error('invalid byte sequence for encoding "UTF8": 0x00');
    expect(run(e).res.status).toHaveBeenCalledWith(400);
  });

  it('los errores inesperados son un 500 genérico sin filtrar detalles ni la traza', () => {
    const { res, filter } = run(new Error('SELECT * FROM secret_table falló: password=abc'));
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual({ statusCode: 500, message: 'Error interno del servidor' });
    expect(JSON.stringify(body)).not.toContain('secret_table');
    expect((filter as any).logger.error).toHaveBeenCalled();
    expect(run('cadena suelta').res.status).toHaveBeenCalledWith(500);
  });

  it('con la respuesta ya iniciada (SSE) solo cierra la conexión', () => {
    const { res } = run(new BadRequestException('x'), true);
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
