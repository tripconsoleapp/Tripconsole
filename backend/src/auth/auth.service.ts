import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { phone: dto.phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
        role: dto.role,
      },
    });

    return { message: 'User registered successfully' };
  }
  //login
  async login(dto: LoginDto, req: any) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 🔒 Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new UnauthorizedException(
        `Account locked until ${user.lockUntil.toISOString()}`,
      );
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password!);

    if (!passwordValid) {
      const attempts = user.failedLoginAttempts + 1;

      // Lock after 5 attempts

      if (attempts >= 5) {
        const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockUntil: lockTime,
          },
        });
        await this.logEvent(
          AuditAction.ACCOUNT_LOCKED,
          user.id,
          { reason: 'Too many failed attempts' },
          ip,
          userAgent,
        );

        throw new UnauthorizedException(
          'Account locked due to too many failed attempts',
        );
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
        },
      });
      await this.logEvent(
        AuditAction.LOGIN_FAILED,
        user.id,
        { reason: 'Invalid password' },
        ip,
        userAgent,
      );

      throw new UnauthorizedException('Invalid credentials');
    }
    await this.logEvent(
      AuditAction.LOGIN_SUCCESS,
      user.id,
      null,
      ip,
      userAgent,
    );

    // ✅ Successful login → reset attempts
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockUntil: null,
      },
    });

    const payload = {
      sub: user.id,
      role: user.role,
      verificationLevel: user.verificationLevel,
    };

    const accessToken = await this.jwt.signAsync(payload);

    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET not defined');
    }

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') as any,
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashedRefreshToken },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
  //refresh
  async refresh(refreshToken: string) {
    try {
      const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');

      if (!refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET not defined');
      }

      // 🔐 STEP 1 — VERIFY incoming refresh token
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });

      // 🔎 STEP 2 — Find user
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException('Access denied');
      }

      // 🔐 STEP 3 — Compare hash
      const refreshTokenMatches = await bcrypt.compare(
        refreshToken,
        user.refreshTokenHash,
      );

      if (!refreshTokenMatches) {
        throw new UnauthorizedException('Access denied');
      }

      // 🔄 STEP 4 — Rotate
      const newPayload = {
        sub: user.id,
        role: user.role,
        verificationLevel: user.verificationLevel,
      };

      const newAccessToken = await this.jwt.signAsync(newPayload);

      const newRefreshToken = await this.jwt.signAsync(newPayload, {
        secret: refreshSecret,
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') as any,
      });
      await this.logEvent(AuditAction.TOKEN_REFRESH, user.id, null);

      const newHashedRefreshToken = await bcrypt.hash(newRefreshToken, 12);
      console.log('Updating hash...');
      console.log('Old hash:', user.refreshTokenHash);
      console.log('New hash:', newHashedRefreshToken);

      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: newHashedRefreshToken },
      });
      console.log('Update completed in db:', updatedUser.refreshTokenHash);
      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch {
      throw new UnauthorizedException('Access denied');
    }
  }
  //logout
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    await this.logEvent(AuditAction.LOGOUT, userId);
    return { message: 'Logged out successfully' };
  }

  private async logEvent(
    action: AuditAction,
    userId?: string,
    metadata?: any,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.prisma.auditLog.create({
      data: {
        action,
        userId,
        metadata,
        ipAddress,
        userAgent,
      },
    });
  }
}
