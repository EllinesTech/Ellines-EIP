import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  buildEllineaAnswer,
  buildEllineaRecommendations,
  retrieveEllineaContext,
  formatRagGrounding,
  type EllineaEnterpriseSnapshot,
  type EllineaMemoryNote,
} from '@ellines-eip/ellinea-ai';

@Controller()
export class EllineaController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'ellinea-ai', version: '0.1.0' };
  }

  @Post('ellinea/ask')
  ask(
    @Body()
    body: {
      question?: string;
      summary?: EllineaEnterpriseSnapshot | null;
      memory?: EllineaMemoryNote[];
    },
  ) {
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 2) {
      return { statusCode: 400, message: 'question is required' };
    }
    const summary = body.summary ?? null;
    const memory = Array.isArray(body.memory) ? body.memory : [];
    const answer = buildEllineaAnswer(question, summary, {
      memory,
      useMemory: true,
    });
    const chunks = retrieveEllineaContext({
      question,
      summary,
      memory,
      limit: 6,
    });
    return {
      answer,
      mode: 'template+rag',
      grounding: formatRagGrounding(chunks),
      recommendations: buildEllineaRecommendations(summary).slice(0, 3),
    };
  }
}
