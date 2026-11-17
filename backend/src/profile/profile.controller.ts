import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { CurrentUser } from '../modules/auth/current-user.decorator';
import { ProfileService } from './profile.service';
import { MyProfileDto, PublicProfileDto, SetFeaturedBadgesDto } from './dto/profile.dto';

/** Perfil propio (Social › Mi Perfil). */
@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MyProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Mi perfil: datos de la cuenta, mascota principal, estadísticas e insignias' })
  @ApiResponse({ status: 200, type: MyProfileDto })
  getMyProfile(@CurrentUser() user: any): Promise<MyProfileDto> {
    return this.profile.getMyProfile(user.id);
  }

  @Put('featured-badges')
  @ApiOperation({ summary: 'Fijar las insignias destacadas del perfil (máx. 3, solo desbloqueadas)' })
  @ApiBody({ type: SetFeaturedBadgesDto })
  @ApiResponse({ status: 200, description: '{ featuredBadges: string[] }' })
  @ApiResponse({ status: 400, description: 'Más de 3, o alguna no está desbloqueada' })
  setFeaturedBadges(@CurrentUser() user: any, @Body() body: SetFeaturedBadgesDto) {
    return this.profile.setFeaturedBadges(user.id, body);
  }
}

/** Perfil público de otro jugador. */
@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class PublicProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get(':id/profile')
  @ApiOperation({ summary: 'Perfil público de un jugador (insignias y estadísticas si las muestra)' })
  @ApiResponse({ status: 200, type: PublicProfileDto })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  getPublicProfile(@CurrentUser() user: any, @Param('id') id: string): Promise<PublicProfileDto> {
    return this.profile.getPublicProfile(user.id, id);
  }
}
