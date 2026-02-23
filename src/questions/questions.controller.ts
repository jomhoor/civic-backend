import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  /** Public — no auth needed for calibration questions */
  @Get('calibration')
  async getCalibrationQuestions() {
    return this.questionsService.getCalibrationQuestions();
  }

  /** Protected — returns user-specific next questions */
  @UseGuards(JwtAuthGuard)
  @Get('next')
  async getNextQuestions(
    @Req() req: any,
    @Query('userId') fallbackId?: string,
    @Query('count') count?: number,
  ) {
    const userId = req.user?.userId ?? fallbackId;
    return this.questionsService.getNextQuestions(userId, count ?? 3);
  }

  /** Public — list all questions */
  @Get('all')
  async getAllQuestions() {
    return this.questionsService.getAllQuestions();
  }

  @Post()
  async createQuestion(
    @Body() body: { text: string; weights: Record<string, number>; order?: number },
  ) {
    return this.questionsService.createQuestion(body);
  }

  @Post('seed')
  async seedQuestions(@Query('force') force?: string) {
    return this.questionsService.seedCalibrationQuestions(force === 'true');
  }
}
