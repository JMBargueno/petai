import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { clientIp } from '../../common/client-ip';
import { ContactService } from './contact.service';
import { ContactDto } from './dto/contact.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enviar un mensaje desde el formulario de contacto público' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Mensaje aceptado' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Datos no válidos' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados mensajes; espera un rato' })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, description: 'No se pudo enviar el correo' })
  async submit(@Body() dto: ContactDto, @Req() req: Request): Promise<void> {
    await this.contact.submit(dto, clientIp(req));
  }
}
