import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { ApiKeyService } from './api-key.service';

export const API_KEY_SCOPE_KEY = 'apiKeyScope';
export const RequireScope = (scope: string) => SetMetadata(API_KEY_SCOPE_KEY, scope);

/** El principal de API key resuelto por el guard (disponible en los handlers). */
export const ApiKeyPrincipal = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().apiKey,
);

/**
 * ApiKeyGuard — Feature 025. Autentica las peticiones públicas vía
 * `Authorization: Bearer petai_key_***` y verifica el scope requerido
 * (declarado por endpoint con `@RequireScope('read:leaderboard')`).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.['authorization'] as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Falta la API key (Authorization: Bearer petai_key_***)',
      );
    }
    const key = auth.slice('Bearer '.length).trim();
    const apiKey = await this.apiKeyService.verify(key); // lanza 401 si inválida/revocada

    const handler = context.getHandler();
    const required = Reflect.getMetadata(API_KEY_SCOPE_KEY, handler) as string | undefined;
    if (required && !(apiKey.scopes as string[]).includes(required)) {
      throw new ForbiddenException(`La API key no tiene el scope requerido: ${required}`);
    }

    await this.apiKeyService.enforceRateLimit(apiKey.id);
    await this.apiKeyService.touchLastUsed(apiKey.id);

    req.apiKey = apiKey;
    return true;
  }
}

