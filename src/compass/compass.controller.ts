import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { CompassService } from './compass.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('compass')
export class CompassController {
  constructor(private readonly compassService: CompassService) {}

  @Get()
  async getCurrentCompass(@Req() req: any, @Query('userId') fallbackId?: string) {
    const userId = req.user?.userId ?? fallbackId;
    return this.compassService.getCurrentCompass(userId);
  }

  @Post('snapshot')
  async saveSnapshot(
    @Req() req: any,
    @Body() body: { userId?: string; snapshotName?: string },
  ) {
    const userId = req.user?.userId ?? body.userId;
    return this.compassService.saveSnapshot(userId, body.snapshotName);
  }

  @Get('history')
  async getHistory(@Req() req: any, @Query('userId') fallbackId?: string) {
    const userId = req.user?.userId ?? fallbackId;
    return this.compassService.getHistory(userId);
  }
}
