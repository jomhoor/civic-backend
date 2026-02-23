import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWallet(@Req() req: any, @Query('userId') fallbackId?: string) {
    const userId = req.user?.userId ?? fallbackId;
    return this.walletService.getWallet(userId);
  }

  @Get('transactions')
  async getTransactions(@Req() req: any, @Query('userId') fallbackId?: string) {
    const userId = req.user?.userId ?? fallbackId;
    return this.walletService.getTransactions(userId);
  }

  @Post('award')
  async awardTokens(
    @Req() req: any,
    @Body() body: { userId?: string; amount: number; reason: string },
  ) {
    const userId = req.user?.userId ?? body.userId;
    return this.walletService.awardTokens(userId, body.amount, body.reason);
  }
}
