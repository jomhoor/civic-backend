import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { CompassModule } from './compass/compass.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { PokeModule } from './poke/poke.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { QuestionsModule } from './questions/questions.module';
import { ResponsesModule } from './responses/responses.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    QuestionnairesModule,
    QuestionsModule,
    ResponsesModule,
    CompassModule,
    WalletModule,
    SchedulerModule,
    MatchmakingModule,
    AnalyticsModule,
    PokeModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
