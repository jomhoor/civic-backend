import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SubmitResponseDto {
  questionId: string;
  answerValue: number;
  responseTimeMs?: number;
}

@Injectable()
export class ResponsesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Submit one or more responses. Uses upsert so re-answering overwrites.
   */
  async submitResponses(userId: string, responses: SubmitResponseDto[]) {
    const results = await Promise.all(
      responses.map((r) =>
        this.prisma.userResponse.upsert({
          where: {
            userId_questionId: {
              userId,
              questionId: r.questionId,
            },
          },
          update: {
            answerValue: r.answerValue,
            responseTimeMs: r.responseTimeMs,
            answeredAt: new Date(),
          },
          create: {
            userId,
            questionId: r.questionId,
            answerValue: r.answerValue,
            responseTimeMs: r.responseTimeMs,
          },
        }),
      ),
    );

    return { submitted: results.length, responses: results };
  }

  /**
   * Get all responses for a user.
   */
  async getUserResponses(userId: string) {
    return this.prisma.userResponse.findMany({
      where: { userId },
      include: { question: true },
      orderBy: { answeredAt: 'desc' },
    });
  }

  /**
   * Get response count per axis for confidence calculation.
   */
  async getResponseCountByAxis(userId: string) {
    const responses = await this.prisma.userResponse.findMany({
      where: { userId },
      include: { question: true },
    });

    const axisCounts: Record<string, number> = {};
    for (const response of responses) {
      const weights = response.question.weights as Record<string, number>;
      for (const axis of Object.keys(weights)) {
        axisCounts[axis] = (axisCounts[axis] ?? 0) + 1;
      }
    }

    return axisCounts;
  }

  /**
   * Delete all user responses for questions that belong to a specific questionnaire.
   * Used when a user wants to retake a questionnaire from scratch.
   */
  async resetForQuestionnaire(userId: string, questionnaireId: string) {
    // Find all question IDs belonging to this questionnaire
    const questions = await this.prisma.question.findMany({
      where: { questionnaireId, active: true },
      select: { id: true },
    });
    const questionIds = questions.map((q) => q.id);

    if (questionIds.length === 0) {
      return { deleted: 0 };
    }

    const result = await this.prisma.userResponse.deleteMany({
      where: {
        userId,
        questionId: { in: questionIds },
      },
    });

    return { deleted: result.count, questionnaireId };
  }
}
