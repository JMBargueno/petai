import { Body, Controller, Get, Post, Query, UseGuards, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChestsService } from './chests.service';
import { ChestListResponse, OpenChestResponse, PurchaseChestResponse } from './dto/chest.dto';
import { OpenChestDto } from './dto/chest-open.dto';
import { PurchaseChestDto } from './dto/chest-purchase.dto';
import { ChestHistoryResponse } from './dto/chest-history.dto';

@ApiTags('Chests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chests')
export class ChestsController {
  constructor(private readonly chestsService: ChestsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar los cofres no abiertos del usuario' })
  @ApiResponse({ status: 200, description: 'Cofres no abiertos', type: ChestListResponse })
  @ApiResponse({ status: 401, description: 'Token ausente o inválido' })
  listChests(@CurrentUser() user: { id: string }) {
    return this.chestsService.listChests(user.id);
  }

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Abrir un cofre (resuelve drops autoritativamente, acredita inventario y pity)' })
  @ApiResponse({ status: 200, description: 'Apertura exitosa', type: OpenChestResponse })
  @ApiResponse({ status: 401, description: 'Token ausente o inválido' })
  @ApiResponse({ status: 404, description: 'Cofre no encontrado o ajeno al usuario' })
  @ApiResponse({ status: 409, description: 'Cofre ya abierto' })
  openChest(@CurrentUser() user: { id: string }, @Body() dto: OpenChestDto) {
    return this.chestsService.openChest(user.id, dto.chestId);
  }

  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Comprar un cofre (bronze/silver/gold) con monedas o gemas' })
  @ApiResponse({ status: 200, description: 'Compra exitosa', type: PurchaseChestResponse })
  @ApiResponse({ status: 400, description: 'Tipo no comprable / método inválido / saldo insuficiente' })
  @ApiResponse({ status: 401, description: 'Token ausente o inválido' })
  @ApiResponse({ status: 409, description: 'Límite de 5 compras diarias alcanzado' })
  purchaseChest(@CurrentUser() user: { id: string }, @Body() dto: PurchaseChestDto) {
    return this.chestsService.purchaseChest(user.id, dto.type, dto.paymentMethod);
  }

  @Get('history')
  @ApiOperation({ summary: 'Historial paginado de aperturas (ordenado por fecha desc)' })
  @ApiResponse({ status: 200, description: 'Aperturas registradas', type: ChestHistoryResponse })
  @ApiResponse({ status: 401, description: 'Token ausente o inválido' })
  getChestHistory(
    @CurrentUser() user: { id: string },
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.chestsService.getChestHistory(user.id, limit ?? 50, offset ?? 0);
  }
}