import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuestionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get calibration questions — one per axis.
   * If questionnaireId is provided, only pick from that questionnaire.
   * If userId is provided, filter out already-answered questions.
   */
  async getCalibrationQuestions(questionnaireId?: string, userId?: string) {
    const where: any = { active: true };
    if (questionnaireId) where.questionnaireId = questionnaireId;

    const allActive = await this.prisma.question.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    // If userId provided, get already-answered question IDs
    let answeredSet = new Set<string>();
    if (userId) {
      const answered = await this.prisma.userResponse.findMany({
        where: { userId },
        select: { questionId: true },
      });
      answeredSet = new Set(answered.map((r) => r.questionId));
    }

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
        (q: { id: string; weights: unknown }) => {
          const w = q.weights as Record<string, number>;
          return axis in w && Math.abs(w[axis]) >= 0.5 && !answeredSet.has(q.id);
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
   * Scoped to a specific questionnaire if questionnaireId is given.
   */
  async getNextQuestions(userId: string, count = 3, questionnaireId?: string) {
    const answeredIds = await this.prisma.userResponse.findMany({
      where: { userId },
      select: { questionId: true },
    });

    const answeredSet = new Set(answeredIds.map((r: { questionId: string }) => r.questionId));

    const where: any = { active: true };
    if (questionnaireId) where.questionnaireId = questionnaireId;

    const allQuestions = await this.prisma.question.findMany({
      where,
      orderBy: { order: 'asc' },
    });

    return allQuestions
      .filter((q: { id: string }) => !answeredSet.has(q.id))
      .slice(0, count);
  }

  /**
   * Get all questions (for research mode — randomized).
   * Scoped to a specific questionnaire if questionnaireId is given.
   */
  async getAllQuestions(questionnaireId?: string) {
    const where: any = { active: true };
    if (questionnaireId) where.questionnaireId = questionnaireId;

    const questions = await this.prisma.question.findMany({ where });
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
    questionnaireId?: string;
  }) {
    return this.prisma.question.create({
      data: {
        text: data.text,
        weights: data.weights,
        order: data.order ?? 0,
        questionnaireId: data.questionnaireId,
      },
    });
  }

  /**
   * Seed all questionnaires and their questions.
   * Creates 5 questionnaires: Civic Compass (80), Quick Compass (16), Digital Age Dilemmas (24),
   * The Political Compass (62), 9 Axes Values (36).
   */
  async seedCalibrationQuestions(force = false) {
    if (force) {
      await this.prisma.userResponse.deleteMany({});
      await this.prisma.compassEntry.deleteMany({});
      await this.prisma.question.deleteMany({});
      await this.prisma.questionnaire.deleteMany({});
    }

    const existingCount = await this.prisma.question.count();
    if (existingCount > 0) {
      return { message: 'Questions already exist', count: existingCount };
    }

    // ─── Create Questionnaires ───
    const civicCompass = await this.prisma.questionnaire.create({
      data: {
        slug: 'civic-compass',
        title: 'Civic Compass',
        titleFa: 'قطب‌نمای مدنی',
        description: 'The comprehensive 80-question political compass covering all 8 axes of civic identity.',
        descriptionFa: 'قطب‌نمای جامع ۸۰ سؤاله که تمام ۸ بُعد هویت مدنی را پوشش می‌دهد.',
        icon: 'Compass',
        questionCount: 80,
        active: false,
        order: 1,
      },
    });

    const quickCompass = await this.prisma.questionnaire.create({
      data: {
        slug: 'quick-compass',
        title: 'Quick Compass',
        titleFa: 'قطب‌نمای سریع',
        description: 'A fast 16-question assessment — 2 per axis. Get your civic snapshot in minutes.',
        descriptionFa: 'ارزیابی سریع ۱۶ سؤاله — ۲ سؤال در هر محور. در چند دقیقه تصویر مدنی خود را بگیرید.',
        icon: 'Zap',
        questionCount: 16,
        active: false,
        order: 2,
      },
    });

    const digitalAge = await this.prisma.questionnaire.create({
      data: {
        slug: 'digital-age',
        title: 'Digital Age Dilemmas',
        titleFa: 'معضلات عصر دیجیتال',
        description: 'Deep dive into technology, AI, digital rights, crypto, and online governance — 24 questions.',
        descriptionFa: 'بررسی عمیق فناوری، هوش مصنوعی، حقوق دیجیتال، رمزارز و حکمرانی آنلاین — ۲۴ سؤال.',
        icon: 'Monitor',
        questionCount: 24,
        active: false,
        order: 3,
      },
    });

    const politicalCompass = await this.prisma.questionnaire.create({
      data: {
        slug: 'political-compass',
        title: 'The Political Compass',
        titleFa: 'قطب‌نمای سیاسی',
        description: 'The classic two-axis political compass: Economic Left↔Right and Social Libertarian↔Authoritarian. 62 propositions.',
        descriptionFa: 'قطب‌نمای سیاسی کلاسیک دو محوری: اقتصاد چپ↔راست و اجتماعی آزادی‌خواه↔اقتدارگرا. ۶۲ گزاره.',
        icon: 'Map',
        questionCount: 62,
        order: 4,
      },
    });

    // 9Axes Political Values — inspired by the 9Axes quiz (MIT License, based on 8values).
    // 9 conceptual axes mapped onto our 8-axis system. 36 original propositions (4 per concept).
    // Original: https://9axes.github.io/ | License: MIT (Copyright © 2017 8values)
    const nineAxes = await this.prisma.questionnaire.create({
      data: {
        slug: 'nine-axes',
        title: '9 Axes Values',
        titleFa: 'ارزش‌های ۹ محور',
        description: 'Evaluate your political values across 9 dimensions — from federalism to multiculturalism. 36 questions inspired by the open-source 9Axes quiz.',
        descriptionFa: 'ارزش‌های سیاسی خود را در ۹ بُعد بسنجید — از فدرالیسم تا چندفرهنگی. ۳۶ سؤال الهام‌گرفته از آزمون متن‌باز ۹ محور.',
        icon: 'BarChart3',
        questionCount: 36,
        active: false,
        order: 5,
      },
    });

    // ───────────────────────────────────────────────
    // Full proposition bank — 10 per axis, 80 total
    // ───────────────────────────────────────────────

    const civicPropositions = [
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

    // ── Quick Compass — 16 questions, 2 per axis ──
    const quickPropositions = [
      { text: 'The government should guarantee a job for everyone who wants one.', weights: { economy: -0.8 }, order: 1 },
      { text: 'The free market is the most efficient way to allocate resources.', weights: { economy: 0.8 }, order: 2 },
      { text: 'Citizens should directly vote on major policy issues.', weights: { governance: 0.8 }, order: 3 },
      { text: 'Strong leadership is more important than checks and balances.', weights: { governance: -0.8 }, order: 4 },
      { text: 'Privacy is more important than national security.', weights: { civil_liberties: 0.8 }, order: 5 },
      { text: 'Surveillance cameras in public spaces make society safer.', weights: { civil_liberties: -0.8 }, order: 6 },
      { text: 'Society should embrace change and new social norms.', weights: { society: 0.8 }, order: 7 },
      { text: 'Proven traditions and customs should guide public life.', weights: { society: -0.8 }, order: 8 },
      { text: 'International cooperation benefits everyone more than going it alone.', weights: { diplomacy: 0.8 }, order: 9 },
      { text: 'A nation must always put its own people first.', weights: { diplomacy: -0.8 }, order: 10 },
      { text: 'Protecting the environment should take priority over economic growth.', weights: { environment: 0.8 }, order: 11 },
      { text: 'Environmental regulations hold back economic progress.', weights: { environment: -0.8 }, order: 12 },
      { text: 'The justice system should focus on rehabilitation, not punishment.', weights: { justice: 0.8 }, order: 13 },
      { text: 'Tough sentences are necessary to deter crime.', weights: { justice: -0.8 }, order: 14 },
      { text: 'New technologies should be adopted quickly, even with unknown risks.', weights: { technology: 0.8 }, order: 15 },
      { text: 'Technology must be carefully regulated before widespread adoption.', weights: { technology: -0.8 }, order: 16 },
    ];

    // ── Digital Age Dilemmas — 24 questions, 3 per axis ──
    const digitalPropositions = [
      // Economy + Tech
      { text: 'Gig economy platforms should be required to provide benefits like traditional employers.', weights: { economy: -0.7, technology: -0.3 }, order: 1 },
      { text: 'Cryptocurrency should replace central bank currencies.', weights: { economy: 0.8, technology: 0.3 }, order: 2 },
      { text: 'Automation that eliminates jobs should be taxed to fund retraining programs.', weights: { economy: -0.7, technology: -0.3 }, order: 3 },
      // Governance + Tech
      { text: 'AI should be used to draft and evaluate legislation.', weights: { governance: -0.6, technology: 0.3 }, order: 4 },
      { text: 'Online platforms should be governed by their users, not corporate boards.', weights: { governance: 0.8, technology: 0.3 }, order: 5 },
      { text: 'Governments should maintain a digital identity system for all citizens.', weights: { governance: -0.7, civil_liberties: -0.3 }, order: 6 },
      // Civil Liberties + Tech
      { text: 'People should own and control all data collected about them.', weights: { civil_liberties: 0.8, technology: -0.3 }, order: 7 },
      { text: 'AI-powered facial recognition in public spaces is an acceptable trade-off for safety.', weights: { civil_liberties: -0.9, technology: 0.3 }, order: 8 },
      { text: 'Anonymous speech online should be a protected right.', weights: { civil_liberties: 0.8, technology: 0.3 }, order: 9 },
      // Society + Tech
      { text: 'Social media algorithms are polarizing society and should be regulated.', weights: { society: -0.3, technology: -0.7 }, order: 10 },
      { text: 'AI-generated art and writing should have the same copyright protections as human-created works.', weights: { society: 0.5, technology: 0.5 }, order: 11 },
      { text: 'Children under 16 should be banned from social media.', weights: { society: -0.6, civil_liberties: -0.3 }, order: 12 },
      // Diplomacy + Tech
      { text: 'Countries should cooperate on global AI safety standards.', weights: { diplomacy: 0.8, technology: -0.3 }, order: 13 },
      { text: 'Cyber warfare capabilities are as important as traditional military defense.', weights: { diplomacy: -0.5, technology: 0.5 }, order: 14 },
      { text: 'Tech companies should be prohibited from operating in authoritarian regimes.', weights: { diplomacy: 0.6, technology: -0.3 }, order: 15 },
      // Environment + Tech
      { text: 'Cloud computing and data centers should meet strict carbon neutrality requirements.', weights: { environment: 0.7, technology: -0.3 }, order: 16 },
      { text: 'Proof-of-work blockchains should be banned due to their energy consumption.', weights: { environment: 0.8, technology: -0.3 }, order: 17 },
      { text: 'Technology will solve climate change without requiring lifestyle sacrifices.', weights: { environment: -0.5, technology: 0.5 }, order: 18 },
      // Justice + Tech
      { text: 'AI should be used in criminal sentencing to reduce human bias.', weights: { justice: 0.5, technology: 0.5 }, order: 19 },
      { text: 'Algorithmic discrimination should carry the same legal penalties as human discrimination.', weights: { justice: 0.7, technology: -0.3 }, order: 20 },
      { text: 'Predictive policing using AI prevents crime more effectively than traditional methods.', weights: { justice: -0.6, technology: 0.3 }, order: 21 },
      // Technology (pure)
      { text: 'Artificial general intelligence (AGI) development should be paused until safety is guaranteed.', weights: { technology: -0.9 }, order: 22 },
      { text: 'Open-source AI models are safer than proprietary ones because they can be publicly audited.', weights: { technology: 0.7 }, order: 23 },
      { text: 'Brain-computer interfaces should be available to the public as soon as they are viable.', weights: { technology: 0.8 }, order: 24 },
    ];

    // ── The Political Compass — 62 propositions ──
    // Two-axis model: Economic Left↔Right (economy axis) and
    // Social Libertarian↔Authoritarian (civil_liberties, governance, society axes).
    // Scoring: agree/strongly-agree with a proposition shifts in the direction of its weights.
    // Negative economy = economic left; positive economy = economic right.
    // Negative civil_liberties/governance/society = authoritarian; positive = libertarian.
    const politicalCompassPropositions = [
      // Page 1 — Globalisation, patriotism, class, economics
      { text: 'If economic globalisation is inevitable, it should primarily serve humanity rather than the interests of trans-national corporations.', weights: { economy: -0.8, diplomacy: 0.3 }, order: 1 },
      { text: "I'd always support my country, whether it was right or wrong.", weights: { diplomacy: -0.7, civil_liberties: -0.3 }, order: 2 },
      { text: "No one chooses their country of birth, so it's foolish to be proud of it.", weights: { society: 0.5, diplomacy: 0.3 }, order: 3 },
      { text: 'Our race has many superior qualities, compared with other races.', weights: { society: -0.9, civil_liberties: -0.3 }, order: 4 },
      { text: 'The enemy of my enemy is my friend.', weights: { diplomacy: -0.5 }, order: 5 },
      { text: 'Military action that defies international law is sometimes justified.', weights: { diplomacy: -0.7, civil_liberties: -0.3 }, order: 6 },
      { text: 'There is now a worrying fusion of information and entertainment.', weights: { society: -0.3, civil_liberties: -0.2 }, order: 7 },
      // Page 2 — Economy & class
      { text: 'People are ultimately divided more by class than by nationality.', weights: { economy: -0.6 }, order: 8 },
      { text: 'Controlling inflation is more important than controlling unemployment.', weights: { economy: 0.7 }, order: 9 },
      { text: 'Because corporations cannot be trusted to voluntarily protect the environment, they require regulation.', weights: { economy: -0.8, environment: 0.3 }, order: 10 },
      { text: '"From each according to his ability, to each according to his need" is a fundamentally good idea.', weights: { economy: -0.9 }, order: 11 },
      { text: 'The freer the market, the freer the people.', weights: { economy: 0.9, civil_liberties: 0.3 }, order: 12 },
      { text: "It's a sad reflection on our society that something as basic as drinking water is now a bottled, branded consumer product.", weights: { economy: -0.6 }, order: 13 },
      { text: "Land shouldn't be a commodity to be bought and sold.", weights: { economy: -0.8 }, order: 14 },
      { text: 'It is regrettable that many personal fortunes are made by people who simply manipulate money and contribute nothing to their society.', weights: { economy: -0.7 }, order: 15 },
      { text: 'Protectionism is sometimes necessary in trade.', weights: { economy: -0.5, diplomacy: -0.3 }, order: 16 },
      { text: 'The only social responsibility of a company should be to deliver a profit to its shareholders.', weights: { economy: 0.9 }, order: 17 },
      { text: 'The rich are too highly taxed.', weights: { economy: 0.8 }, order: 18 },
      { text: 'Those with the ability to pay should have access to higher standards of medical care.', weights: { economy: 0.6 }, order: 19 },
      { text: 'Governments should penalise businesses that mislead the public.', weights: { economy: -0.5, justice: 0.3 }, order: 20 },
      { text: 'A genuine free market requires restrictions on the ability of predator multinationals to create monopolies.', weights: { economy: -0.4 }, order: 21 },
      // Page 3 — Social / personal / authority
      { text: "Abortion, when the woman's life is not threatened, should always be illegal.", weights: { civil_liberties: -0.9, society: -0.5 }, order: 22 },
      { text: 'All authority should be questioned.', weights: { civil_liberties: 0.8, governance: 0.5 }, order: 23 },
      { text: 'An eye for an eye and a tooth for a tooth.', weights: { justice: -0.7, civil_liberties: -0.3 }, order: 24 },
      { text: 'Taxpayers should not be expected to prop up any theatres or museums that cannot survive on a commercial basis.', weights: { economy: 0.6 }, order: 25 },
      { text: 'Schools should not make classroom attendance compulsory.', weights: { civil_liberties: 0.6 }, order: 26 },
      { text: 'All people have their rights, but it is better for all of us that different sorts of people should keep to their own kind.', weights: { society: -0.9, civil_liberties: -0.5 }, order: 27 },
      { text: 'Good parents sometimes have to spank their children.', weights: { civil_liberties: -0.5, society: -0.3 }, order: 28 },
      { text: "It's natural for children to keep some secrets from their parents.", weights: { civil_liberties: 0.4 }, order: 29 },
      { text: 'Possessing marijuana for personal use should not be a criminal offence.', weights: { civil_liberties: 0.8, justice: 0.3 }, order: 30 },
      { text: 'The prime function of schooling should be to equip the future generation to find jobs.', weights: { economy: 0.4, society: -0.3 }, order: 31 },
      { text: 'People with serious inheritable disabilities should not be allowed to reproduce.', weights: { civil_liberties: -0.9, society: -0.5 }, order: 32 },
      { text: 'The most important thing for children to learn is to accept discipline.', weights: { civil_liberties: -0.6, society: -0.4 }, order: 33 },
      { text: 'There are no savage and civilised peoples; there are only different cultures.', weights: { society: 0.7, diplomacy: 0.3 }, order: 34 },
      { text: 'Those who are able to work, and refuse the opportunity, should not expect society\'s support.', weights: { economy: 0.7 }, order: 35 },
      { text: "When you are troubled, it's better not to think about it, but to keep busy with more cheerful things.", weights: { society: -0.2 }, order: 36 },
      { text: 'First-generation immigrants can never be fully integrated within their new country.', weights: { society: -0.7, diplomacy: -0.3 }, order: 37 },
      { text: "What's good for the most successful corporations is always, ultimately, good for all of us.", weights: { economy: 0.8 }, order: 38 },
      { text: 'No broadcasting institution, however independent its content, should receive public funding.', weights: { economy: 0.6 }, order: 39 },
      // Page 4 — State, liberty, crime, religion
      { text: 'Our civil liberties are being excessively curbed in the name of counter-terrorism.', weights: { civil_liberties: 0.8 }, order: 40 },
      { text: 'A significant advantage of a one-party state is that it avoids all the arguments that delay progress in a democratic political system.', weights: { governance: -0.9, civil_liberties: -0.5 }, order: 41 },
      { text: 'Although the electronic age makes official surveillance easier, only wrongdoers need to be worried.', weights: { civil_liberties: -0.8 }, order: 42 },
      { text: 'The death penalty should be an option for the most serious crimes.', weights: { justice: -0.8, civil_liberties: -0.3 }, order: 43 },
      { text: 'In a civilised society, one must always have people above to be obeyed and people below to be commanded.', weights: { governance: -0.9, civil_liberties: -0.5 }, order: 44 },
      { text: "Abstract art that doesn't represent anything shouldn't be considered art at all.", weights: { society: -0.4 }, order: 45 },
      { text: 'In criminal justice, punishment should be more important than rehabilitation.', weights: { justice: -0.7, civil_liberties: -0.3 }, order: 46 },
      { text: 'It is a waste of time to try to rehabilitate some criminals.', weights: { justice: -0.5 }, order: 47 },
      { text: 'The businessperson and the manufacturer are more important than the writer and the artist.', weights: { economy: 0.5, society: -0.3 }, order: 48 },
      { text: 'Mothers may have careers, but their first duty is to be homemakers.', weights: { society: -0.8, civil_liberties: -0.3 }, order: 49 },
      { text: 'Almost all politicians promise economic growth, but we should heed the warnings of climate science that growth is detrimental to our efforts to curb global warming.', weights: { environment: 0.7, economy: -0.3 }, order: 50 },
      { text: 'Making peace with the establishment is an important aspect of maturity.', weights: { civil_liberties: -0.4, governance: -0.3 }, order: 51 },
      // Page 5 — Religion, sex, morality
      { text: 'Astrology accurately explains many things.', weights: { society: -0.3 }, order: 52 },
      { text: 'You cannot be moral without being religious.', weights: { society: -0.8 }, order: 53 },
      { text: 'Charity is better than social security as a means of helping the genuinely disadvantaged.', weights: { economy: 0.7 }, order: 54 },
      { text: 'Some people are naturally unlucky.', weights: { society: -0.2 }, order: 55 },
      { text: "It is important that my child's school instills religious values.", weights: { society: -0.7, civil_liberties: -0.3 }, order: 56 },
      { text: 'Sex outside marriage is usually immoral.', weights: { society: -0.8, civil_liberties: -0.3 }, order: 57 },
      { text: 'A same sex couple in a stable, loving relationship should not be excluded from the possibility of child adoption.', weights: { society: 0.8, civil_liberties: 0.5 }, order: 58 },
      { text: 'Pornography, depicting consenting adults, should be legal for the adult population.', weights: { civil_liberties: 0.7, society: 0.3 }, order: 59 },
      { text: 'What goes on in a private bedroom between consenting adults is no business of the state.', weights: { civil_liberties: 0.9, society: 0.3 }, order: 60 },
      { text: 'No one can feel naturally homosexual.', weights: { society: -0.8, civil_liberties: -0.3 }, order: 61 },
      { text: 'These days openness about sex has gone too far.', weights: { society: -0.6, civil_liberties: -0.3 }, order: 62 },
    ];

    // ───────────────────────────────────────────────
    // 9Axes original propositions — 36 total (4 per conceptual axis)
    // Conceptual axes: Federal/Unitary, Democratic/Authoritarian, Globalist/Isolationist,
    // Militarist/Pacifist, Security/Freedom, Equality/Markets, Secular/Religious,
    // Progressive/Traditional, Assimilationist/Multiculturalist.
    // Inspired by the 9Axes quiz (MIT License, Copyright © 2017 8values).
    // All propositions below are original.
    const nineAxesPropositions = [
      // Federal vs Unitary → governance
      { text: 'Local communities should have the primary authority over education, policing, and land use in their area.', weights: { governance: 0.8 }, order: 1 },
      { text: 'A single national curriculum and set of standards ensures equal opportunity for all citizens.', weights: { governance: -0.7 }, order: 2 },
      { text: 'Regions with distinct cultural identities deserve significant legislative autonomy.', weights: { governance: 0.7, society: 0.3 }, order: 3 },
      { text: 'Strong central coordination prevents wasteful duplication and ensures efficient public services.', weights: { governance: -0.8 }, order: 4 },
      // Democratic vs Authoritarian → governance, civil_liberties
      { text: 'Citizens should be able to propose laws and trigger national referendums on important issues.', weights: { governance: 0.8, civil_liberties: 0.5 }, order: 5 },
      { text: 'Quick decisive action by leaders is more valuable than the slow deliberation of democratic debate.', weights: { governance: -0.8, civil_liberties: -0.4 }, order: 6 },
      { text: 'All positions of political power should be subject to regular competitive elections.', weights: { governance: 0.7 }, order: 7 },
      { text: 'Most people lack the knowledge needed to make wise decisions on complex policy matters.', weights: { governance: -0.6, civil_liberties: -0.3 }, order: 8 },
      // Globalist vs Isolationist → diplomacy
      { text: 'International organizations should have the authority to enforce human rights standards worldwide.', weights: { diplomacy: 0.8, justice: 0.4 }, order: 9 },
      { text: 'A nation\'s foreign policy should focus exclusively on advancing its own strategic interests.', weights: { diplomacy: -0.8 }, order: 10 },
      { text: 'Free movement of people between countries generally creates more prosperity than it costs.', weights: { diplomacy: 0.7, economy: 0.3 }, order: 11 },
      { text: 'Binding international agreements undermine a nation\'s right to self-governance.', weights: { diplomacy: -0.7, governance: -0.3 }, order: 12 },
      // Militarist vs Pacifist → diplomacy, justice
      { text: 'Military strength is the foundation upon which a nation\'s diplomatic influence rests.', weights: { diplomacy: -0.5, justice: -0.5 }, order: 13 },
      { text: 'Diplomatic negotiation should always be exhausted before any military option is considered.', weights: { diplomacy: 0.7, justice: 0.5 }, order: 14 },
      { text: 'Mandatory national service — military or civilian — builds civic duty and social cohesion.', weights: { civil_liberties: -0.6, governance: -0.3 }, order: 15 },
      { text: 'Defence budgets could be far better spent on healthcare, education, and infrastructure.', weights: { diplomacy: 0.5, economy: -0.3, environment: 0.3 }, order: 16 },
      // Security vs Freedom → civil_liberties
      { text: 'Government surveillance programs are a justified trade-off for preventing terrorism and serious crime.', weights: { civil_liberties: -0.9 }, order: 17 },
      { text: 'No amount of security justifies the government reading citizens\' private communications.', weights: { civil_liberties: 0.9 }, order: 18 },
      { text: 'National identity databases and biometric tracking make society safer for everyone.', weights: { civil_liberties: -0.7, technology: 0.3 }, order: 19 },
      { text: 'Citizens should be free to encrypt their data and communications without government backdoors.', weights: { civil_liberties: 0.8, technology: 0.4 }, order: 20 },
      // Equality vs Markets → economy
      { text: 'Essential services like healthcare, education, and housing should be guaranteed by the state to all citizens.', weights: { economy: -0.8 }, order: 21 },
      { text: 'A competitive free market with minimal regulation produces the best outcomes for society.', weights: { economy: 0.9 }, order: 22 },
      { text: 'Progressive taxation — where the wealthy pay a higher percentage — is fair and necessary.', weights: { economy: -0.6, justice: 0.3 }, order: 23 },
      { text: 'Entrepreneurship and private enterprise are the primary engines of innovation and prosperity.', weights: { economy: 0.7, technology: 0.3 }, order: 24 },
      // Secular vs Religious → society
      { text: 'Religious institutions should have no influence on government policy or legislation.', weights: { society: 0.8 }, order: 25 },
      { text: 'Moral values rooted in religious tradition provide an essential foundation for a just society.', weights: { society: -0.8 }, order: 26 },
      { text: 'Public schools should teach about world religions comparatively rather than promoting any single faith.', weights: { society: 0.6, civil_liberties: 0.3 }, order: 27 },
      { text: 'A nation\'s laws and holidays should reflect its dominant cultural and religious heritage.', weights: { society: -0.7 }, order: 28 },
      // Progressive vs Traditional → technology, society
      { text: 'Emerging technologies like AI and genetic engineering offer humanity its greatest opportunities.', weights: { technology: 0.9 }, order: 29 },
      { text: 'Traditional family structures and community bonds are more valuable than technological convenience.', weights: { technology: -0.6, society: -0.7 }, order: 30 },
      { text: 'Society should embrace social and cultural change as a sign of healthy evolution.', weights: { society: 0.8, technology: 0.3 }, order: 31 },
      { text: 'Rapid social change destabilises communities and erodes the values that hold them together.', weights: { society: -0.8, technology: -0.3 }, order: 32 },
      // Assimilationist vs Multiculturalist → society, diplomacy
      { text: 'Immigrants should be expected to adopt the language, customs, and civic values of their new country.', weights: { society: -0.5, diplomacy: -0.4 }, order: 33 },
      { text: 'A diverse society with many cultural traditions is stronger and more creative than a homogeneous one.', weights: { society: 0.7, diplomacy: 0.4 }, order: 34 },
      { text: 'Maintaining a shared national identity is more important than celebrating cultural differences.', weights: { society: -0.6, diplomacy: -0.3 }, order: 35 },
      { text: 'Multilingual government services and multicultural education enrich a society.', weights: { society: 0.5, diplomacy: 0.5, civil_liberties: 0.3 }, order: 36 },
    ];

    // Create all questions with their questionnaire IDs
    const [civicResult, quickResult, digitalResult, compassResult, nineAxesResult] = await Promise.all([
      this.prisma.question.createMany({
        data: civicPropositions.map((p) => ({ ...p, questionnaireId: civicCompass.id })),
      }),
      this.prisma.question.createMany({
        data: quickPropositions.map((p) => ({ ...p, questionnaireId: quickCompass.id })),
      }),
      this.prisma.question.createMany({
        data: digitalPropositions.map((p) => ({ ...p, questionnaireId: digitalAge.id })),
      }),
      this.prisma.question.createMany({
        data: politicalCompassPropositions.map((p) => ({ ...p, questionnaireId: politicalCompass.id })),
      }),
      this.prisma.question.createMany({
        data: nineAxesPropositions.map((p) => ({ ...p, questionnaireId: nineAxes.id })),
      }),
    ]);

    return {
      message: 'Seeded 5 questionnaires with propositions',
      questionnaires: [
        { slug: 'civic-compass', questions: civicResult.count },
        { slug: 'quick-compass', questions: quickResult.count },
        { slug: 'digital-age', questions: digitalResult.count },
        { slug: 'political-compass', questions: compassResult.count },
        { slug: 'nine-axes', questions: nineAxesResult.count },
      ],
      totalQuestions: civicResult.count + quickResult.count + digitalResult.count + compassResult.count + nineAxesResult.count,
    };
  }
}
