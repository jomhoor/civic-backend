import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  /** Returns calibration questions, optionally filtered by user's answered questions */
  @UseGuards(JwtAuthGuard)
  @Get('calibration')
  async getCalibrationQuestions(
    @Req() req: any,
    @Query('questionnaireId') questionnaireId?: string,
  ) {
    const userId = req.user?.userId;
    return this.questionsService.getCalibrationQuestions(questionnaireId, userId);
  }

  /** Protected — returns user-specific next questions */
  @UseGuards(JwtAuthGuard)
  @Get('next')
  async getNextQuestions(
    @Req() req: any,
    @Query('userId') fallbackId?: string,
    @Query('count') count?: number,
    @Query('questionnaireId') questionnaireId?: string,
  ) {
    const userId = req.user?.userId ?? fallbackId;
    return this.questionsService.getNextQuestions(userId, count ?? 3, questionnaireId);
  }

  /** Public — list all questions */
  @Get('all')
  async getAllQuestions(@Query('questionnaireId') questionnaireId?: string) {
    return this.questionsService.getAllQuestions(questionnaireId);
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
