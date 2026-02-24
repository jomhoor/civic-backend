import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  /** Upload or update the user's chat public key */
  @Post('public-key')
  setPublicKey(
    @Request() req: { user: { userId: string } },
    @Body('publicKey') publicKey: string,
  ) {
    return this.chatService.setPublicKey(req.user.userId, publicKey);
  }

  /** Get a contact's chat public key (requires mutual poke) */
  @Get('public-key/:userId')
  getPublicKey(
    @Request() req: { user: { userId: string } },
    @Param('userId') targetUserId: string,
  ) {
    return this.chatService.getPublicKey(req.user.userId, targetUserId);
  }

  /** Get thread list (conversation partners + metadata) */
  @Get('threads')
  getThreads(@Request() req: { user: { userId: string } }) {
    return this.chatService.getThreads(req.user.userId);
  }

  /** Get unseen message count */
  @Get('unseen-count')
  getUnseenCount(@Request() req: { user: { userId: string } }) {
    return this.chatService.getUnseenCount(req.user.userId);
  }

  /** Get conversation with a specific user (paginated) */
  @Get(':otherUserId')
  getConversation(
    @Request() req: { user: { userId: string } },
    @Param('otherUserId') otherUserId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getConversation(
      req.user.userId,
      otherUserId,
      cursor,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /** Send an encrypted message */
  @Post(':receiverId')
  sendMessage(
    @Request() req: { user: { userId: string } },
    @Param('receiverId') receiverId: string,
    @Body() body: { ciphertext: string; nonce: string },
  ) {
    return this.chatService.sendMessage(
      req.user.userId,
      receiverId,
      body.ciphertext,
      body.nonce,
    );
  }

  /** Mark messages from a specific user as seen */
  @Post(':otherUserId/mark-seen')
  markSeen(
    @Request() req: { user: { userId: string } },
    @Param('otherUserId') otherUserId: string,
  ) {
    return this.chatService.markSeen(req.user.userId, otherUserId);
  }
}
