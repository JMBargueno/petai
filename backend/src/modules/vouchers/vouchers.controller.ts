import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthThrottleService } from '../auth/auth-throttle.service';
import { RedeemVoucherDto, RewardReceivedDto } from './dto/vouchers.dto';
import { VouchersService } from './vouchers.service';

/** Intentos de canje por cuenta: frena que se prueben códigos a lo bruto. */
const REDEEM_MAX_ATTEMPTS = 10;
const REDEEM_WINDOW_MS = 15 * 60_000;

@ApiTags('Vouchers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(
    private readonly vouchers: VouchersService,
    private readonly throttle: AuthThrottleService,
  ) {}

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Canjear un voucher de recompensas (una vez por cuenta)' })
  @ApiResponse({ status: HttpStatus.OK, type: RewardReceivedDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Código no válido o caducado' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ya canjeado por esta cuenta' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Demasiados intentos' })
  async redeem(@CurrentUser() user: any, @Body() body: RedeemVoucherDto) {
    await this.throttle.consume(`voucher-redeem:${user.id}`, REDEEM_MAX_ATTEMPTS, REDEEM_WINDOW_MS);
    return this.vouchers.redeem(user.id, body);
  }
}
