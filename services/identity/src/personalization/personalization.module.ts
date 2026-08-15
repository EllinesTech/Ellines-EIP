import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PersonalizationService } from './personalization.service';
import { UserContextProfiler } from './user-context-profiler.service';
import { AdaptiveDashboardGenerator } from './adaptive-dashboard-generator.service';
import { AiResponseTailor } from './ai-response-tailor.service';
import { PreferenceLearner } from './preference-learner.service';
import { NotificationPreferenceAdjuster } from './notification-preference-adjuster.service';
import { ContextAwareShortcutSuggester } from './context-aware-shortcut-suggester.service';
import { PersonalizationController } from './personalization.controller';

@Module({
  imports: [PrismaModule],
  providers: [
    PersonalizationService,
    UserContextProfiler,
    AdaptiveDashboardGenerator,
    AiResponseTailor,
    PreferenceLearner,
    NotificationPreferenceAdjuster,
    ContextAwareShortcutSuggester,
  ],
  controllers: [PersonalizationController],
  exports: [
    PersonalizationService,
    UserContextProfiler,
    AdaptiveDashboardGenerator,
    AiResponseTailor,
    PreferenceLearner,
    NotificationPreferenceAdjuster,
    ContextAwareShortcutSuggester,
  ],
})
export class PersonalizationModule {}
