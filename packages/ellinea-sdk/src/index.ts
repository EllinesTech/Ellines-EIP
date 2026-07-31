import type {
  EllineaEnterpriseSnapshot,
  EllineaMemoryNote,
  EllineaRecFeedback,
  EllineaRecommendation,
  RagChunk,
  RecFeedbackVote,
} from '@ellines-eip/ellinea-ai';

export type EllineaSdkOptions = {
  /** Base URL including /api/v1, e.g. http://localhost:3002/api/v1 */
  baseUrl: string;
  /** Optional bearer token for later auth. */
  getAccessToken?: () => string | null | Promise<string | null>;
  fetchImpl?: typeof fetch;
};

async function request<T>(
  opts: EllineaSdkOptions,
  path: string,
  body?: unknown,
): Promise<T> {
  const fetchFn = opts.fetchImpl || fetch;
  const token = opts.getAccessToken ? await opts.getAccessToken() : null;
  const res = await fetchFn(`${opts.baseUrl.replace(/\/$/, '')}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ellinea SDK ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function createEllineaClient(options: EllineaSdkOptions) {
  return {
    health() {
      return request<{ status: string; service: string; version: string; contract?: string }>(
        options,
        '/health',
      );
    },
    ask(input: {
      question: string;
      summary?: EllineaEnterpriseSnapshot | null;
      memory?: EllineaMemoryNote[];
      role?: string;
      organizationName?: string;
    }) {
      return request<{
        answer: string;
        mode: string;
        grounding: string;
        recommendations: EllineaRecommendation[];
      }>(options, '/ellinea/ask', input);
    },
    brief(input: {
      summary?: EllineaEnterpriseSnapshot | null;
      role?: string;
      organizationName?: string;
    }) {
      return request<{ brief: string }>(options, '/ellinea/brief', input);
    },
    recommend(input: {
      summary?: EllineaEnterpriseSnapshot | null;
      role?: string;
      feedback?: EllineaRecFeedback;
    }) {
      return request<{ recommendations: EllineaRecommendation[] }>(
        options,
        '/ellinea/recommend',
        input,
      );
    },
    memorySearch(input: {
      question: string;
      memory: EllineaMemoryNote[];
      summary?: EllineaEnterpriseSnapshot | null;
    }) {
      return request<{ chunks: RagChunk[] }>(options, '/ellinea/memory/search', input);
    },
    feedback(input: {
      organizationId?: string;
      recId: string;
      vote: RecFeedbackVote;
      recommendations?: EllineaRecommendation[];
      feedback?: EllineaRecFeedback;
      summary?: EllineaEnterpriseSnapshot | null;
      role?: string;
    }) {
      return request<{
        feedback: EllineaRecFeedback;
        recommendations: EllineaRecommendation[];
      }>(options, '/ellinea/feedback', input);
    },
  };
}

export type EllineaClient = ReturnType<typeof createEllineaClient>;

export type {
  EllineaEnterpriseSnapshot,
  EllineaMemoryNote,
  EllineaRecFeedback,
  EllineaRecommendation,
  RagChunk,
  RecFeedbackVote,
};
