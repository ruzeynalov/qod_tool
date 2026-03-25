import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsEmail, MinLength, IsUUID } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID('all')
  orgId: string;
}

@Public()
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { accessToken, refreshToken } = await this.authService.login(user);
    return { accessToken, refreshToken, user };
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto.orgId, {
      email: dto.email,
      password: dto.password,
      name: dto.name,
    });

    return { user };
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    const result = await this.authService.refreshAccessToken(body.refreshToken);
    if (!result) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return result;
  }
}
