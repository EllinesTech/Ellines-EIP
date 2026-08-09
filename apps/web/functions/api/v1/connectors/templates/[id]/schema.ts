import { Router } from 'itty-router';

const router = Router();

function getApiUrl(env?: Record<string, string>): string {
  return (env && env['IDENTITY_API_URL']) || 'http://localhost:3001';
}

// GET /api/v1/connectors/templates/:id/schema
router.get('/api/v1/connectors/templates/:id/schema', async (req: any, env?: Record<string, string>) => {
  try {
    const { id } = req.params;

    const response = await fetch(
      `${getApiUrl(env)}/api/v1/connectors/templates/${id}/schema`,
      {
        headers: {
          'Authorization': req.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const schema = await response.json();
    return new Response(JSON.stringify(schema), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[templates/:id/schema] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
