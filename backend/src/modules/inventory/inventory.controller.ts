import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('Inventory & Shop')
@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('shop')
  @ApiOperation({ summary: 'Listar artículos de la tienda' })
  getShop() {
    return this.inventoryService.getShopItems();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('inventory')
  @ApiOperation({ summary: 'Obtener inventario del usuario' })
  getInventory(@CurrentUser() user: any) {
    return this.inventoryService.getInventory(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('shop/buy')
  @ApiOperation({ summary: 'Comprar artículo de la tienda' })
  buyItem(
    @CurrentUser() user: any,
    @Body() body: { itemId: string; quantity?: number },
  ) {
    return this.inventoryService.buyItem(user.id, body.itemId, body.quantity || 1);
  }
}
