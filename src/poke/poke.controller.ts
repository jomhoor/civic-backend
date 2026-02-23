import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PokeService } from './poke.service';

@UseGuards(JwtAuthGuard)
@Controller('poke')
export class PokeController {
  constructor(private readonly pokeService: PokeService) {}

  /** Send a poke to another user */
  @Post(':targetUserId')
  async sendPoke(@Req() req: any, @Param('targetUserId') targetUserId: string) {
    const senderId = req.user.userId;
    return this.pokeService.sendPoke(senderId, targetUserId);
  }

  /** Get all received pokes */
  @Get()
  async getReceivedPokes(@Req() req: any) {
    return this.pokeService.getReceivedPokes(req.user.userId);
  }

  /** Get unseen poke count (for badge) */
  @Get('unseen-count')
  async getUnseenCount(@Req() req: any) {
    const count = await this.pokeService.getUnseenPokeCount(req.user.userId);
    return { count };
  }

  /** Mark all pokes as seen */
  @Post('mark-seen')
  async markSeen(@Req() req: any) {
    return this.pokeService.markPokesSeen(req.user.userId);
  }

  /** Get poke status with a specific user (for profile page) */
  @Get('status/:targetUserId')
  async getPokeStatus(@Req() req: any, @Param('targetUserId') targetUserId: string) {
    return this.pokeService.getPokeStatus(req.user.userId, targetUserId);
  }
}
