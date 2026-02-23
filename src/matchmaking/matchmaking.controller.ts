import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { MatchmakingService, MatchMode, MatchResult } from './matchmaking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  /**
   * GET /matches/suggest?mode=mirror|challenger|complement&limit=10&threshold=0.5
   */
  @Get('suggest')
  async suggestMatches(
    @Req() req: any,
    @Query('mode') mode: string = 'mirror',
    @Query('limit') limit: string = '10',
    @Query('threshold') threshold?: string,
  ): Promise<MatchResult[]> {
    const userId = req.user.userId;
    const validModes: MatchMode[] = ['mirror', 'challenger', 'complement'];
    const matchMode = validModes.includes(mode as MatchMode)
      ? (mode as MatchMode)
      : 'mirror';

    return this.matchmakingService.findMatches(
      userId,
      matchMode,
      Math.min(parseInt(limit) || 10, 50),
      threshold ? parseFloat(threshold) : undefined,
    );
  }

  /**
   * GET /matches/settings — Get privacy & matching preferences.
   */
  @Get('settings')
  async getSettings(@Req() req: any) {
    return this.matchmakingService.getSettings(req.user.userId);
  }

  /**
   * POST /matches/settings — Update privacy & matching preferences.
   */
  @Post('settings')
  async updateSettings(
    @Req() req: any,
    @Body() body: {
      sharingMode?: string;
      displayName?: string;
      matchThreshold?: number;
    },
  ) {
    const userId = req.user.userId;
    const results: Record<string, unknown> = {};

    if (body.sharingMode) {
      const valid = ['GHOST', 'PUBLIC', 'SELECTIVE'];
      if (valid.includes(body.sharingMode)) {
        results.sharing = await this.matchmakingService.setSharingMode(userId, body.sharingMode);
      }
    }

    if (body.displayName !== undefined) {
      results.displayName = await this.matchmakingService.setDisplayName(userId, body.displayName);
    }

    if (body.matchThreshold !== undefined) {
      results.threshold = await this.matchmakingService.setMatchThreshold(userId, body.matchThreshold);
    }

    return results;
  }
}
