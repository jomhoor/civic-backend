import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { QuestionnairesService } from './questionnaires.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('questionnaires')
export class QuestionnairesController {
  constructor(private readonly questionnairesService: QuestionnairesService) {}

  /** Public — list all active questionnaires */
  @Get()
  async listQuestionnaires() {
    return this.questionnairesService.listQuestionnaires();
  }

  /** Protected — get user progress for each questionnaire */
  @UseGuards(JwtAuthGuard)
  @Get('progress')
  async getUserProgress(@Req() req: any) {
    const userId = req.user?.userId;
    return this.questionnairesService.getUserProgress(userId);
  }
}
