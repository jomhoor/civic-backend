import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get 8 calibration questions — one per axis.
   * Picks the first question (lowest order) from each axis group.
   */
  async getCalibrationQuestions() {
    const allActive = await this.prisma.question.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });

    const axes = [
      'economy',
      'governance',
      'civil_liberties',
      'society',
      'diplomacy',
      'environment',
      'justice',
      'technology',
    ];

    const picked: typeof allActive = [];
    for (const axis of axes) {
      const match = allActive.find(
        (q: { weights: unknown }) => {
          const w = q.weights as Record<string, number>;
          return axis in w && Math.abs(w[axis]) >= 0.5;
        },
      );
      if (match && !picked.includes(match)) {
        picked.push(match);
      }
    }

    return picked;
  }

  /**
   * Get next unanswered questions for a paced session.
   */
  async getNextQuestions(userId: string, count = 3) {
    const answeredIds = await this.prisma.userResponse.findMany({
      where: { userId },
      select: { questionId: true },
    });

    const answeredSet = new Set(answeredIds.map((r: { questionId: string }) => r.questionId));

    const allQuestions = await this.prisma.question.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });

    return allQuestions
      .filter((q: { id: string }) => !answeredSet.has(q.id))
      .slice(0, count);
  }

  /**
   * Get all questions (for research mode — randomized).
   */
  async getAllQuestions() {
    const questions = await this.prisma.question.findMany({
      where: { active: true },
    });
    // Fisher-Yates shuffle
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    return questions;
  }

  /**
   * Create a new question (admin).
   */
  async createQuestion(data: {
    text: string;
    weights: Record<string, number>;
    order?: number;
  }) {
    return this.prisma.question.create({
      data: {
        text: data.text,
        weights: data.weights,
        order: data.order ?? 0,
      },
    });
  }

  /**
   * Seed initial calibration questions (one per axis).
   */
  async seedCalibrationQuestions(force = false) {
    if (force) {
      // Delete responses first (FK constraint), then questions
      await this.prisma.userResponse.deleteMany({});
      await this.prisma.question.deleteMany({});
    }

    const existingCount = await this.prisma.question.count();
    if (existingCount > 0) {
      return { message: 'Questions already exist', count: existingCount };
    }

    // ───────────────────────────────────────────────
    // Full proposition bank — 10 per axis, 80 total
    // Axis poles (see axes_definition.md):
    //   Economy:         -1 Regulated/Planned  →  +1 Free Market
    //   Governance:      -1 Authoritarian      →  +1 Libertarian/Decentralized
    //   Civil Liberties: -1 Security/Order      →  +1 Liberty/Rights
    //   Society:         -1 Traditional         →  +1 Progressive
    //   Diplomacy:       -1 Nationalist         →  +1 Internationalist
    //   Environment:     -1 Productivist        →  +1 Ecologist
    //   Justice:         -1 Punitive            →  +1 Rehabilitative
    //   Technology:      -1 Regulation          →  +1 Acceleration
    //
    // answerValue agreement (+1) pushes toward the primary-weight pole.
    // Cross-loadings kept to at most 1 secondary axis at |0.3|.
    // ───────────────────────────────────────────────

    const propositions = [
      // ── Economy (orders 1-10) ──
      { text: 'The government should provide universal healthcare, even if it means higher taxes.', weights: { economy: -0.8, governance: -0.3 }, order: 1 },
      { text: 'A flat tax rate for everyone is fairer than a progressive tax system.', weights: { economy: 0.8 }, order: 2 },
      { text: 'Public utilities like water and electricity should never be privatized.', weights: { economy: -0.8 }, order: 3 },
      { text: 'Minimum wage laws do more harm than good by discouraging hiring.', weights: { economy: 0.8 }, order: 4 },
      { text: 'The state should own key industries such as energy and transportation.', weights: { economy: -0.9, governance: -0.3 }, order: 5 },
      { text: 'Free trade agreements benefit society more than protectionist tariffs.', weights: { economy: 0.7, diplomacy: 0.3 }, order: 6 },
      { text: 'Billionaires should not exist — extreme wealth should be taxed away.', weights: { economy: -0.9 }, order: 7 },
      { text: 'Deregulating industries leads to more innovation and lower prices.', weights: { economy: 0.8, technology: 0.3 }, order: 8 },
      { text: 'Universal basic income is a better approach than traditional welfare programs.', weights: { economy: -0.6 }, order: 9 },
      { text: 'Rent control is necessary to protect tenants in expensive cities.', weights: { economy: -0.7 }, order: 10 },

      // ── Governance (orders 11-20) ──
      { text: 'Direct democracy (citizens voting on every issue) is better than representative democracy.', weights: { governance: 0.8 }, order: 11 },
      { text: 'A strong central leader can get more done than a slow democratic process.', weights: { governance: -0.9 }, order: 12 },
      { text: 'Power should be distributed to local communities rather than concentrated in a national government.', weights: { governance: 0.8 }, order: 13 },
      { text: 'Term limits for all elected officials are essential to prevent corruption.', weights: { governance: 0.6 }, order: 14 },
      { text: 'Expert technocrats should make major policy decisions instead of elected politicians.', weights: { governance: -0.7 }, order: 15 },
      { text: 'Citizens should be able to recall any elected official at any time through a referendum.', weights: { governance: 0.8 }, order: 16 },
      { text: 'A political system with a single dominant party can provide more stability than multi-party democracy.', weights: { governance: -0.9 }, order: 17 },
      { text: 'Juries of randomly selected citizens should have the power to veto laws.', weights: { governance: 0.7 }, order: 18 },
      { text: 'Federal governments should have the power to override local laws when necessary.', weights: { governance: -0.7 }, order: 19 },
      { text: 'Blockchain-based voting could make elections more transparent and trustworthy.', weights: { governance: 0.6, technology: 0.3 }, order: 20 },

      // ── Civil Liberties (orders 21-30) ──
      { text: 'Freedom of speech should be absolute, with no exceptions for hate speech.', weights: { civil_liberties: 0.9 }, order: 21 },
      { text: 'Mass surveillance is acceptable if it prevents terrorist attacks.', weights: { civil_liberties: -0.9 }, order: 22 },
      { text: 'People should be allowed to own firearms for personal protection.', weights: { civil_liberties: 0.7 }, order: 23 },
      { text: 'Governments should be able to restrict internet content to protect public morality.', weights: { civil_liberties: -0.8, society: -0.3 }, order: 24 },
      { text: 'Peaceful protests should never be restricted, even if they disrupt daily life.', weights: { civil_liberties: 0.8 }, order: 25 },
      { text: 'National ID systems and biometric databases improve public safety.', weights: { civil_liberties: -0.7 }, order: 26 },
      { text: 'Whistleblowers who expose government wrongdoing should always be protected from prosecution.', weights: { civil_liberties: 0.8, governance: 0.3 }, order: 27 },
      { text: 'Curfews and emergency powers are sometimes necessary to maintain public order.', weights: { civil_liberties: -0.7, governance: -0.3 }, order: 28 },
      { text: 'People have the right to use end-to-end encryption, even if it hampers criminal investigations.', weights: { civil_liberties: 0.8, technology: 0.3 }, order: 29 },
      { text: 'Mandatory military or civil service builds national unity and discipline.', weights: { civil_liberties: -0.6 }, order: 30 },

      // ── Society (orders 31-40) ──
      { text: 'Traditional family structures are the foundation of a stable society.', weights: { society: -0.8 }, order: 31 },
      { text: 'Marriage should be defined by individuals, not by religious or cultural traditions.', weights: { society: 0.8 }, order: 32 },
      { text: 'Schools should teach comprehensive sex education starting at an early age.', weights: { society: 0.7 }, order: 33 },
      { text: 'Immigration enriches our culture and should be encouraged.', weights: { society: 0.7, diplomacy: 0.3 }, order: 34 },
      { text: 'Religious values should play a role in shaping public policy.', weights: { society: -0.8, governance: -0.3 }, order: 35 },
      { text: 'Gender identity is a spectrum and should be legally recognized beyond male and female.', weights: { society: 0.9 }, order: 36 },
      { text: 'A society that changes too quickly loses its cultural identity.', weights: { society: -0.7 }, order: 37 },
      { text: 'Affirmative action programs are necessary to correct historical injustices.', weights: { society: 0.7, justice: 0.3 }, order: 38 },
      { text: 'Assimilation into the dominant culture should be expected of immigrants.', weights: { society: -0.7, diplomacy: -0.3 }, order: 39 },
      { text: 'Art and media should challenge social norms, even if some people find it offensive.', weights: { society: 0.7, civil_liberties: 0.3 }, order: 40 },

      // ── Diplomacy (orders 41-50) ──
      { text: 'My country should prioritize its own interests over international cooperation.', weights: { diplomacy: -0.8 }, order: 41 },
      { text: 'Open borders would lead to greater global prosperity and understanding.', weights: { diplomacy: 0.9 }, order: 42 },
      { text: 'International organizations like the UN do more good than harm.', weights: { diplomacy: 0.7 }, order: 43 },
      { text: 'Foreign aid is a waste of taxpayer money that should be spent domestically.', weights: { diplomacy: -0.8, economy: 0.3 }, order: 44 },
      { text: 'Military alliances like NATO are essential for global stability.', weights: { diplomacy: 0.6 }, order: 45 },
      { text: 'Countries should have the absolute right to control their borders without outside interference.', weights: { diplomacy: -0.8 }, order: 46 },
      { text: 'Global problems like climate change require global governance mechanisms.', weights: { diplomacy: 0.8, environment: 0.3 }, order: 47 },
      { text: 'Cultural exchange programs and student visas strengthen international bonds.', weights: { diplomacy: 0.7 }, order: 48 },
      { text: 'Economic sanctions are an effective and ethical tool of foreign policy.', weights: { diplomacy: 0.5 }, order: 49 },
      { text: 'A country\'s first duty is always to its own citizens, not to the global community.', weights: { diplomacy: -0.8 }, order: 50 },

      // ── Environment (orders 51-60) ──
      { text: 'Economic growth should never come at the cost of environmental protection.', weights: { environment: 0.8, economy: -0.3 }, order: 51 },
      { text: 'Nuclear energy is essential for achieving carbon neutrality.', weights: { environment: 0.5, technology: 0.3 }, order: 52 },
      { text: 'Individual lifestyle changes matter less than systemic corporate regulation for the environment.', weights: { environment: 0.6, economy: -0.3 }, order: 53 },
      { text: 'Developing countries should not be held to the same environmental standards as wealthy nations.', weights: { environment: -0.5, diplomacy: -0.3 }, order: 54 },
      { text: 'We should ban single-use plastics entirely, even if it inconveniences consumers.', weights: { environment: 0.7 }, order: 55 },
      { text: 'Climate change concerns are often exaggerated and hurt economic competitiveness.', weights: { environment: -0.9 }, order: 56 },
      { text: 'Animal agriculture should be phased out for environmental and ethical reasons.', weights: { environment: 0.8 }, order: 57 },
      { text: 'Resource extraction like mining and drilling is necessary for economic development.', weights: { environment: -0.7, economy: 0.3 }, order: 58 },
      { text: 'Cities should prioritize public transit and cycling over private car infrastructure.', weights: { environment: 0.7 }, order: 59 },
      { text: 'Property owners should have the right to develop their land without environmental restrictions.', weights: { environment: -0.8, civil_liberties: 0.3 }, order: 60 },

      // ── Justice (orders 61-70) ──
      { text: 'Rehabilitation should be the primary goal of the justice system, not punishment.', weights: { justice: 0.8 }, order: 61 },
      { text: 'Some crimes are so severe that the death penalty is justified.', weights: { justice: -0.9 }, order: 62 },
      { text: 'Drug use should be treated as a public health issue, not a criminal one.', weights: { justice: 0.8, civil_liberties: 0.3 }, order: 63 },
      { text: 'Harsher sentences are the best deterrent against crime.', weights: { justice: -0.8 }, order: 64 },
      { text: 'Restorative justice (mediation between victim and offender) should be used more widely.', weights: { justice: 0.8 }, order: 65 },
      { text: 'Corporations that cause environmental damage should face criminal prosecution, not just fines.', weights: { justice: 0.5, environment: 0.3 }, order: 66 },
      { text: 'Juvenile offenders should be tried as adults for violent crimes.', weights: { justice: -0.8 }, order: 67 },
      { text: 'Prison labour is a form of exploitation that should be abolished.', weights: { justice: 0.7 }, order: 68 },
      { text: 'Victims of crime should have more say in the sentencing process.', weights: { justice: -0.5 }, order: 69 },
      { text: 'A society is best judged by how it treats its prisoners.', weights: { justice: 0.7 }, order: 70 },

      // ── Technology (orders 71-80) ──
      { text: 'Artificial intelligence should be regulated even if it slows down innovation.', weights: { technology: -0.7 }, order: 71 },
      { text: 'Social media companies should not be held liable for user-generated content.', weights: { technology: 0.7, civil_liberties: 0.3 }, order: 72 },
      { text: 'Governments should have the ability to shut down the internet during national emergencies.', weights: { technology: -0.8, civil_liberties: -0.3 }, order: 73 },
      { text: 'Genetic engineering of humans (gene therapy, designer babies) should be permitted.', weights: { technology: 0.8 }, order: 74 },
      { text: 'Big tech monopolies need to be broken up, even if their products are popular.', weights: { technology: -0.6, economy: -0.3 }, order: 75 },
      { text: 'Cryptocurrency and decentralized finance will create a more equitable financial system.', weights: { technology: 0.8, economy: 0.3 }, order: 76 },
      { text: 'Autonomous weapons (drones, AI soldiers) should be banned by international law.', weights: { technology: -0.7, diplomacy: 0.3 }, order: 77 },
      { text: 'Open-source development produces better technology than proprietary corporate software.', weights: { technology: 0.6 }, order: 78 },
      { text: 'Data collected by tech companies should be treated as a public resource.', weights: { technology: -0.5, civil_liberties: -0.3 }, order: 79 },
      { text: 'Space colonization should be a priority, even at great cost.', weights: { technology: 0.8 }, order: 80 },
    ];

    const created = await this.prisma.question.createMany({
      data: propositions,
    });

    return { message: 'Seeded proposition bank', count: created.count };
  }
}
