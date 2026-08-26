import { Body, Controller, Get, Headers, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

// Sent by the mobile app: unlike browsers, it has no persistent cookie jar,
// so it needs the refresh token back in the JSON body to store it itself.
const MOBILE_CLIENT_HEADER = 'x-client-type';
const MOBILE_CLIENT_VALUE = 'mobile';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Headers(MOBILE_CLIENT_HEADER) clientType?: string,
  ) {
    const { refreshToken, ...result } = await this.authService.register(dto);
    res.cookie('refresh_token', refreshToken, this.authService.getRefreshCookieOptions());
    return this.withMobileRefreshToken(result, refreshToken, clientType);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers(MOBILE_CLIENT_HEADER) clientType?: string,
  ) {
    const { refreshToken, ...result } = await this.authService.login(dto);
    res.cookie('refresh_token', refreshToken, this.authService.getRefreshCookieOptions());
    return this.withMobileRefreshToken(result, refreshToken, clientType);
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  async refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Headers(MOBILE_CLIENT_HEADER) clientType?: string,
  ) {
    const { refreshToken, ...result } = await this.authService.refresh(user);
    res.cookie('refresh_token', refreshToken, this.authService.getRefreshCookieOptions());
    return this.withMobileRefreshToken(result, refreshToken, clientType);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token', { path: '/api/auth' });
    return { loggedOut: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user);
  }

  private withMobileRefreshToken<T extends object>(
    result: T,
    refreshToken: string,
    clientType?: string,
  ): T | (T & { refreshToken: string }) {
    if (clientType !== MOBILE_CLIENT_VALUE) {
      return result;
    }
    return { ...result, refreshToken };
  }
}
