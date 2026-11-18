import { Body, Controller, Delete, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodPipe } from '../../common/zod.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../authz/permissions.guard';
import { RequirePermissions } from '../authz/require-permissions.decorator';
import { InternalAiInput, InternalAiService } from './internal-ai.service';

const internalAiSchema = z
  .object({
    baseUrl: z.string().trim().min(1).max(500),
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().max(500).optional(),
    jsonMode: z.boolean().default(true),
    allowPrivateNetwork: z.boolean().default(false),
    enabled: z.boolean().default(true),
  })
  .strict();

/**
 * Conexión de IA interna (endpoint compatible con la API de OpenAI) que usa la IA del sistema.
 * Da acceso a una clave del equipo y a destinos de red: solo quien gestiona la facturación y la IA.
 */
@ApiTags('Admin AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('billing:manage')
@Controller('admin/ai/internal')
export class AdminInternalAiController {
  constructor(private readonly internalAi: InternalAiService) {}

  @Get()
  @ApiOperation({ summary: 'Conexión de IA interna guardada (la clave nunca se devuelve, solo una máscara)' })
  get() {
    return this.internalAi.getView();
  }

  @Put()
  @ApiOperation({ summary: 'Guardar la conexión de IA interna. Sin `apiKey` se conserva la clave guardada; vacía la borra.' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['baseUrl', 'model'],
      properties: {
        baseUrl: { type: 'string', description: 'URL base compatible con OpenAI, p. ej. https://ia.ejemplo.com/v1' },
        model: { type: 'string' },
        apiKey: { type: 'string' },
        jsonMode: { type: 'boolean', description: 'Pedir la salida con response_format json_object' },
        allowPrivateNetwork: { type: 'boolean', description: 'Permitir http y direcciones de red privada' },
        enabled: { type: 'boolean' },
      },
    },
  })
  save(@CurrentUser() user: any, @Body(new ZodPipe(internalAiSchema)) body: InternalAiInput) {
    return this.internalAi.save(body, user?.id ?? 'admin');
  }

  @Delete()
  @ApiOperation({ summary: 'Quitar la conexión de IA interna (la IA del sistema vuelve a su respaldo)' })
  remove() {
    return this.internalAi.remove();
  }

  @Post('test')
  @ApiOperation({ summary: 'Probar la conexión guardada con una llamada mínima' })
  test() {
    return this.internalAi.test();
  }
}
