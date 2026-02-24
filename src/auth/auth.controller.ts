import { Controller, Post, Body, Get, Param, UseGuards, Req } from '@nestjs/common';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class WalletAuthDto {
  @IsString()
  walletAddress: string;

  @IsBoolean()
  @IsOptional()
  isSmartWallet?: boolean;
}

class SiweVerifyDto {
  @IsString()
  message: string;

  @IsString()
  signature: string;
}

class ResearchAuthDto {
  @IsString()
  userId: string;

  @IsString()
  inviteCode: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Step 1: Frontend requests a one-time nonce before signing.
   */
  @Get('nonce')
  getNonce() {
    return { nonce: this.authService.generateNonce() };
  }

  /**
   * Step 2: Frontend sends the signed SIWE message + signature.
   * Returns the authenticated user + JWT.
   */
  @Post('verify')
  async verifySiwe(@Body() dto: SiweVerifyDto) {
    return this.authService.verifySiwe(dto.message, dto.signature);
  }

  /**
   * Legacy wallet auth (kept for backwards compatibility / dev mode).
   * Will be removed once SIWE is fully adopted.
   */
  @Post('wallet')
  async walletAuth(@Body() dto: WalletAuthDto) {
    const user = await this.authService.findOrCreateUser(
      dto.walletAddress,
      dto.isSmartWallet ?? false,
    );
    return { user, token: `mock-jwt-${user.id}` };
  }

  @Post('research')
  async activateResearch(@Body() dto: ResearchAuthDto) {
    const user = await this.authService.activateResearchMode(
      dto.userId,
      dto.inviteCode,
    );
    if (!user) {
      return { error: 'Invalid invite code' };
    }
    return { user };
  }

  /**
   * Create a guest account (no wallet needed).
   * Returns a user + JWT so the guest can answer questionnaires.
   */
  @Post('guest')
  async guestAuth() {
    return this.authService.createGuestUser();
  }

  /**
   * Get the current authenticated user's profile.
   * Protected by JWT guard.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    return this.authService.getUserById(req.user.userId);
  }

  @Get('user/:id')
  async getUser(@Param('id') id: string) {
    return this.authService.getUserById(id);
  }
}
