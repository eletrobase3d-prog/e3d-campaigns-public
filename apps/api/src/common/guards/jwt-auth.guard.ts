import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization as string | undefined;
    const [type, token] = authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token required');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT is not configured');
    }

    let payload: CurrentUserPayload;
    try {
      payload = this.jwt.verify<CurrentUserPayload>(token, { secret });
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (typeof payload.sub !== 'string' || typeof payload.organizationId !== 'string' ||
        !uuid.test(payload.sub) || !uuid.test(payload.organizationId)) throw new Error('Invalid identity');
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada. Entre novamente.');
    }
    const membership = await this.prisma.organizationUser.findFirst({
      where: { userId: payload.sub, organizationId: payload.organizationId,
        user: { status: 'ACTIVE' }, organization: { status: 'ACTIVE' } },
      select: { role: true },
    });
    if (!membership) throw new UnauthorizedException('Seu acesso não está mais disponível. Entre novamente ou contate o administrador.');
    // All current guarded endpoints allow analyst reads and reserve writes for managers.
    // Public authentication/registration endpoints do not use this guard.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) {
      throw new ForbiddenException('Seu perfil permite apenas consultas. Atualize a página para ver suas permissões atuais.');
    }
    request.user = { sub: payload.sub, organizationId: payload.organizationId, role: membership.role };
    return true;
  }
}
