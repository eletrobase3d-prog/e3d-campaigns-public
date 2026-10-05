import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OrganizationRole } from '@prisma/client';
import { hash, compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();

    if (!secret) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }

    return secret;
  }

  private sign(
    userId: string,
    organizationId: string,
    role: OrganizationRole,
    secret: string,
  ): string {
    return this.jwt.sign(
      { sub: userId, organizationId, role },
      {
        secret,
        expiresIn: 43200,
      },
    );
  }

  async register(dto: RegisterDto) {
    // Preflight configuration BEFORE any database write.
    // This prevents a partially-created account if JWT configuration is missing.
    const jwtSecret = this.getJwtSecret();

    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const baseSlug = this.slugify(dto.organizationName) || 'organization';
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`;
    const passwordHash = await hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email,
          passwordHash,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
        },
      });

      const membership = await tx.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: OrganizationRole.OWNER,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          action: 'auth.register',
          entityType: 'organization',
          entityId: organization.id,
        },
      });

      return { user, organization, membership };
    });

    return {
      accessToken: this.sign(
        result.user.id,
        result.organization.id,
        result.membership.role,
        jwtSecret,
      ),
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
    };
  }

  async login(dto: LoginDto) {
    const jwtSecret = this.getJwtSecret();

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: {
          where: { organization: { status: 'ACTIVE' } },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await compare(dto.password, user.passwordHash);
    const membership = user.memberships.at(0);

    if (!passwordOk || !membership || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: this.sign(
        user.id,
        membership.organizationId,
        membership.role,
        jwtSecret,
      ),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      organizationId: membership.organizationId,
      role: membership.role,
    };
  }
}
