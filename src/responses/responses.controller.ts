import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResponsesService } from './responses.service';

class SingleResponseDto {
  @IsString()
  questionId: string;

  @IsNumber()
  answerValue: number;

  @IsOptional()
  @IsNumber()
  responseTimeMs?: number;
}

class SubmitResponsesDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SingleResponseDto)
  responses: SingleResponseDto[];
}

@UseGuards(JwtAuthGuard)
@Controller('responses')
export class ResponsesController {
  constructor(private readonly responsesService: ResponsesService) {}

  @Post()
  async submitResponses(@Req() req: any, @Body() dto: SubmitResponsesDto) {
    const userId = req.user?.userId ?? dto.userId;
    return this.responsesService.submitResponses(userId, dto.responses);
  }

  @Get()
  async getUserResponses(@Req() req: any, @Query('userId') fallbackId?: string) {
    const userId = req.user?.userId ?? fallbackId;
    return this.responsesService.getUserResponses(userId);
  }

  @Delete('questionnaire/:questionnaireId')
  async resetForQuestionnaire(
    @Req() req: any,
    @Param('questionnaireId') questionnaireId: string,
  ) {
    const userId = req.user?.userId;
    return this.responsesService.resetForQuestionnaire(userId, questionnaireId);
  }
}
