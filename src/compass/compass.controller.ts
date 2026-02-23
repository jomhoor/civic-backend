import { Controller, Get, Post, Body, Query, Param, UseGuards, Req, NotFoundException } from '@nestjs/common';
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

  @Get('snapshot/:id')
  async getSnapshot(@Param('id') id: string) {
    const snapshot = await this.compassService.getSnapshot(id);
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    return snapshot;
  }

  @Get('diff')
  async diffSnapshots(@Query('id1') id1: string, @Query('id2') id2: string) {
    const diff = await this.compassService.diffSnapshots(id1, id2);
    if (!diff) throw new NotFoundException('One or both snapshots not found');
    return diff;
  }

  @Get('frequency')
  async getFrequency(@Req() req: any) {
    const userId = req.user?.userId;
    return this.compassService.getFrequencyPreference(userId);
  }

  @Post('frequency')
  async setFrequency(
    @Req() req: any,
    @Body() body: { frequency: string },
  ) {
    const userId = req.user?.userId;
    return this.compassService.setFrequencyPreference(userId, body.frequency);
  }
}
