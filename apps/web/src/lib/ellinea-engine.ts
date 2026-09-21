/** Browser-safe Ellinea core exports from the shared package. */
import * as ellineaCore from '@ellines-eip/ellinea-ai';

export type {
  EllineaContext,
  EllineaEnterpriseSnapshot,
  EllineaMemoryNote,
  EllineaRecFeedback,
  EllineaRecommendation,
  EnterpriseDnaSnapshot,
  EnterpriseDnaTrait,
  LearningSignal,
  RecFeedbackVote,
} from '@ellines-eip/ellinea-ai';

export const memoryStorageKey = ellineaCore.memoryStorageKey;
export const readEllineaMemory = ellineaCore.readEllineaMemory;
export const writeEllineaMemory = ellineaCore.writeEllineaMemory;
export const feedbackStorageKey = ellineaCore.feedbackStorageKey;
export const readRecFeedback = ellineaCore.readRecFeedback;
export const writeRecFeedback = ellineaCore.writeRecFeedback;
export const dnaStorageKey = ellineaCore.dnaStorageKey;
export const readEnterpriseDna = ellineaCore.readEnterpriseDna;
export const writeEnterpriseDna = ellineaCore.writeEnterpriseDna;
export const buildLearningSignals = ellineaCore.buildLearningSignals;
export const rebuildEnterpriseDna = ellineaCore.rebuildEnterpriseDna;
export const recordRecFeedback = ellineaCore.recordRecFeedback;
export const rankRecommendations = ellineaCore.rankRecommendations;
export const buildEllineaRecommendations = ellineaCore.buildEllineaRecommendations;
export const buildRankedRecommendations = ellineaCore.buildRankedRecommendations;
export const buildDailyBriefText = ellineaCore.buildDailyBriefText;
export const buildEllineaAnswer = ellineaCore.buildEllineaAnswer;
