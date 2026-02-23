import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompassService } from './compass.service';

@Controller('compass')
export class CompassController {
  constructor(private readonly compassService: CompassService) {}

  /**
   * Public profile endpoint — returns a user's compass + truncated wallet address.
   * No authentication required so profiles can be shared.
   */
  @Get('profile/:userId')
  async getPublicProfile(@Param('userId') userId: string) {
    const user = await this.compassService.getUserPublicProfile(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getCurrentCompass(
    @Req() req: any,
    @Query('userId') fallbackId?: string,
    @Query('questionnaireId') questionnaireId?: string,
  ) {
    const userId = req.user?.userId ?? fallbackId;
    return this.compassService.getCurrentCompass(userId, questionnaireId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('snapshot')
  async saveSnapshot(
    @Req() req: any,
    @Body() body: { userId?: string; snapshotName?: string; questionnaireId?: string },
  ) {
    const userId = req.user?.userId ?? body.userId;
    return this.compassService.saveSnapshot(userId, body.snapshotName, body.questionnaireId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(
    @Req() req: any,
    @Query('userId') fallbackId?: string,
    @Query('questionnaireId') questionnaireId?: string,
  ) {
    const userId = req.user?.userId ?? fallbackId;
    return this.compassService.getHistory(userId, questionnaireId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('snapshot/:id')
  async getSnapshot(@Param('id') id: string) {
    const snapshot = await this.compassService.getSnapshot(id);
    if (!snapshot) throw new NotFoundException('Snapshot not found');
    return snapshot;
  }

  @UseGuards(JwtAuthGuard)
  @Get('diff')
  async diffSnapshots(@Query('id1') id1: string, @Query('id2') id2: string) {
    const diff = await this.compassService.diffSnapshots(id1, id2);
    if (!diff) throw new NotFoundException('One or both snapshots not found');
    return diff;
  }

  @UseGuards(JwtAuthGuard)
  @Get('frequency')
  async getFrequency(@Req() req: any) {
    const userId = req.user?.userId;
    return this.compassService.getFrequencyPreference(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('frequency')
  async setFrequency(
    @Req() req: any,
    @Body() body: { frequency: string },
  ) {
    const userId = req.user?.userId;
    return this.compassService.setFrequencyPreference(userId, body.frequency);
  }
}
