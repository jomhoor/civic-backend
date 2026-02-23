import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuestionnairesService {
  constructor(private prisma: PrismaService) {}

  /**
   * List all active questionnaires, ordered by `order` field.
   * Includes a live count of questions assigned to each.
   */
  async listQuestionnaires() {
    const questionnaires = await this.prisma.questionnaire.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { questions: { where: { active: true } } } },
      },
    });

    return questionnaires.map((q) => ({
      id: q.id,
      slug: q.slug,
      title: q.title,
      titleFa: q.titleFa,
      description: q.description,
      descriptionFa: q.descriptionFa,
      icon: q.icon,
      questionCount: q._count.questions,
      order: q.order,
    }));
  }

  /**
   * Get a single questionnaire by ID.
   */
  async getById(id: string) {
    return this.prisma.questionnaire.findUnique({ where: { id } });
  }

  /**
   * Get a single questionnaire by slug.
   */
  async getBySlug(slug: string) {
    return this.prisma.questionnaire.findUnique({ where: { slug } });
  }

  /**
   * Get user progress for each questionnaire.
   * Returns answered / total for each questionnaire.
   */
  async getUserProgress(userId: string) {
    const questionnaires = await this.prisma.questionnaire.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      include: {
        questions: {
          where: { active: true },
          select: { id: true },
        },
      },
    });

    // Get all response question IDs for this user
    const responses = await this.prisma.userResponse.findMany({
      where: { userId },
      select: { questionId: true },
    });
    const answeredSet = new Set(responses.map((r) => r.questionId));

    return questionnaires.map((q) => {
      const total = q.questions.length;
      const answered = q.questions.filter((qu) => answeredSet.has(qu.id)).length;
      return {
        questionnaireId: q.id,
        slug: q.slug,
        title: q.title,
        titleFa: q.titleFa,
        description: q.description,
        descriptionFa: q.descriptionFa,
        icon: q.icon,
        total,
        answered,
        completed: total > 0 && answered >= total,
        progress: total > 0 ? Math.round((answered / total) * 100) : 0,
      };
    });
  }
}
