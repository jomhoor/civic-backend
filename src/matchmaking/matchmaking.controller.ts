import { Controller, Get, Post, Body, Query, UseGuards, Req, Param, HttpException, HttpStatus } from '@nestjs/common';
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

  // ──────────────────────────────────────────────────
  // Connection Requests
  // ──────────────────────────────────────────────────

  /**
   * POST /matches/connect — Send a connection request.
   */
  @Post('connect')
  async sendConnectionRequest(
    @Req() req: any,
    @Body() body: {
      receiverId: string;
      matchMode: string;
      matchScore: number;
      message?: string;
    },
  ) {
    try {
      return await this.matchmakingService.sendConnectionRequest(
        req.user.userId,
        body.receiverId,
        body.matchMode,
        body.matchScore,
        body.message,
      );
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /matches/connect/:id/respond — Accept or decline a connection request.
   */
  @Post('connect/:id/respond')
  async respondToConnection(
    @Req() req: any,
    @Param('id') connectionId: string,
    @Body() body: { action: 'ACCEPTED' | 'DECLINED' },
  ) {
    try {
      return await this.matchmakingService.respondToConnection(
        connectionId,
        req.user.userId,
        body.action,
      );
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /matches/connect/:id/cancel — Cancel a sent connection request.
   */
  @Post('connect/:id/cancel')
  async cancelConnection(
    @Req() req: any,
    @Param('id') connectionId: string,
  ) {
    try {
      return await this.matchmakingService.cancelConnection(
        connectionId,
        req.user.userId,
      );
    } catch (err: any) {
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * GET /matches/incoming — Get pending incoming connection requests.
   */
  @Get('incoming')
  async getIncomingRequests(@Req() req: any) {
    return this.matchmakingService.getIncomingRequests(req.user.userId);
  }

  /**
   * GET /matches/connections — Get all accepted connections (with full wallet addresses).
   */
  @Get('connections')
  async getConnections(@Req() req: any) {
    return this.matchmakingService.getConnections(req.user.userId);
  }
}
