import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { AdminEmailService } from './admin-email.service';

const contentBody: SchemaObject = {
  type: 'object',
  required: ['subject', 'html'],
  properties: {
    subject: { type: 'string', maxLength: 200 },
    preheader: { type: 'string', maxLength: 200 },
    html: { type: 'string', description: 'Cuerpo en HTML libre: se envuelve en la plantilla de marca' },
  },
};

const audienceBody: SchemaObject = {
  type: 'object',
  description: "{type:'users',userIds[]} | {type:'emails',emails[]} | {type:'segment',role?,verified?:'any'|'verified'|'unverified'}",
};

/** Envíos de correo desde el panel de administración (permiso `email:send`). */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('email:send')
@Controller('admin/emails')
export class AdminEmailController {
  constructor(private readonly emails: AdminEmailService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vista previa: devuelve el HTML final con la plantilla de marca' })
  @ApiBody({ schema: contentBody })
  preview(@Body() body: unknown) {
    return this.emails.preview(body);
  }

  @Post('audience/count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Número de destinatarios de un público (los segmentos excluyen las bajas)' })
  @ApiBody({ schema: { type: 'object', properties: { audience: audienceBody } } })
  count(@Body() body: unknown) {
    return this.emails.countRaw(body);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar una prueba al correo del propio administrador' })
  @ApiBody({ schema: contentBody })
  test(@CurrentUser() actor: any, @Body() body: unknown) {
    return this.emails.sendTest(actor, body);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un envío (se encola y se manda por lotes; queda auditado)' })
  @ApiBody({ schema: { ...contentBody, required: ['subject', 'html', 'audience'], properties: { ...contentBody.properties, audience: audienceBody } } })
  create(@CurrentUser() actor: any, @Body() body: unknown) {
    return this.emails.create(actor, body);
  }

  @Get()
  @ApiOperation({ summary: 'Historial de envíos (paginado)' })
  list(@Query() query: Record<string, string>) {
    return this.emails.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle y progreso de un envío' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.emails.get(id);
  }
}

/**
 * Baja de los correos informativos (público, enlace firmado). GET muestra la confirmación (los
 * escáneres de enlaces no dan de baja a nadie); POST la aplica: botón del formulario o "un clic"
 * de los clientes de correo (RFC 8058, cabecera List-Unsubscribe-Post).
 */
@ApiTags('Email')
@Controller('email')
export class EmailUnsubscribeController {
  constructor(private readonly emails: AdminEmailService) {}

  @Get('unsubscribe')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  page(@Query('token') token: string) {
    return this.emails.unsubscribePage(this.emails.unsubscribe.verify(token) ? 'confirm' : 'invalid', token);
  }

  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async unsubscribe(@Query('token') queryToken: string, @Req() req: Request, @Res() res: Response) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = queryToken || (typeof body.token === 'string' ? body.token : undefined);
    const ok = await this.emails.applyUnsubscribe(token);
    res
      .status(ok ? HttpStatus.OK : HttpStatus.BAD_REQUEST)
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(this.emails.unsubscribePage(ok ? 'done' : 'invalid'));
  }
}
