import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  buildDailyBriefText,
  buildEllineaAnswer,
  buildEllineaRecommendations,
  buildRankedRecommendations,
  formatRagGrounding,
  rankRecommendations,
  retrieveEllineaContext,
  type EllineaEnterpriseSnapshot,
  type EllineaMemoryNote,
  type EllineaRecFeedback,
  type EllineaRecommendation,
  type RecFeedbackVote,
} from '@ellines-eip/ellinea-ai';

type AskBody = {
  question?: string;
  summary?: EllineaEnterpriseSnapshot | null;
  memory?: EllineaMemoryNote[];
  role?: string;
  organizationName?: string;
};

@Controller()
export class EllineaController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'ellinea-ai', version: '0.1.0', contract: 'v0.1' };
  }

  @Post('ellinea/ask')
  ask(@Body() body: AskBody) {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 2) {
      return { statusCode: 400, message: 'question is required' };
    }
    const summary = body.summary ?? null;
    const memory = Array.isArray(body.memory) ? body.memory : [];
    const answer = buildEllineaAnswer(question, summary, {
      memory,
      useMemory: true,
      useRoleContext: true,
      role: body.role,
      organizationName: body.organizationName,
    });
    const chunks = retrieveEllineaContext({
      question,
      summary,
      memory,
      limit: 6,
    });
    return {
      answer,
      mode: 'template+rag' as const,
      grounding: formatRagGrounding(chunks),
      recommendations: buildEllineaRecommendations(summary, {
        role: body.role,
        useRoleContext: true,
      }).slice(0, 3),
    };
  }

  @Post('ellinea/brief')
  brief(
    @Body()
    body: {
      summary?: EllineaEnterpriseSnapshot | null;
      role?: string;
      organizationName?: string;
    },
  ) {
    return {
      brief: buildDailyBriefText(body.summary ?? null, {
        role: body.role,
        organizationName: body.organizationName,
        useRoleContext: true,
      }),
    };
  }

  @Post('ellinea/recommend')
  recommend(
    @Body()
    body: {
      summary?: EllineaEnterpriseSnapshot | null;
      role?: string;
      feedback?: EllineaRecFeedback;
    },
  ) {
    const base = buildEllineaRecommendations(body.summary ?? null, {
      role: body.role,
      useRoleContext: true,
    });
    const recommendations = body.feedback
      ? rankRecommendations(base, body.feedback)
      : base;
    return { recommendations };
  }

  @Post('ellinea/memory/search')
  memorySearch(
    @Body()
    body: {
      question?: string;
      memory?: EllineaMemoryNote[];
      summary?: EllineaEnterpriseSnapshot | null;
    },
  ) {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const all = retrieveEllineaContext({
      question: question || 'memory',
      summary: body.summary ?? null,
      memory: Array.isArray(body.memory) ? body.memory : [],
      limit: 12,
    });
    const chunks = all.filter((c) => c.source === 'memory');
    return { chunks: chunks.length ? chunks : all.slice(0, 5) };
  }

  @Post('ellinea/feedback')
  feedback(
    @Body()
    body: {
      organizationId?: string;
      recId?: string;
      vote?: RecFeedbackVote;
      recommendations?: EllineaRecommendation[];
      feedback?: EllineaRecFeedback;
      summary?: EllineaEnterpriseSnapshot | null;
      role?: string;
    },
  ) {
    const recId = typeof body.recId === 'string' ? body.recId : '';
    const vote = body.vote === 'dismiss' ? 'dismiss' : 'helpful';
    const prev = body.feedback || {};
    const cur = prev[recId] || { helpful: 0, dismiss: 0 };
    const next: EllineaRecFeedback = recId
      ? {
          ...prev,
          [recId]: {
            helpful: cur.helpful + (vote === 'helpful' ? 1 : 0),
            dismiss: cur.dismiss + (vote === 'dismiss' ? 1 : 0),
          },
        }
      : prev;

    const recommendations =
      Array.isArray(body.recommendations) && body.recommendations.length
        ? rankRecommendations(body.recommendations, next)
        : buildRankedRecommendations(body.summary ?? null, {
            role: body.role,
            useRoleContext: true,
            organizationId: body.organizationId,
            useFeedback: false,
          });

    // Stateless service: client persists feedback; we return the updated map + ranking.
    return { feedback: next, recommendations };
  }
}
