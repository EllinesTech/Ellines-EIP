import { Router } from 'itty-router';

const router = Router({ base: '/api/v1/connectors/templates' });

function getApiUrl(env?: Record<string, string>): string {
  return (env && env['IDENTITY_API_URL']) || 'http://localhost:3001';
}

// GET /api/v1/connectors/templates
router.get('', async (req: any, env?: Record<string, string>) => {
  try {
    const { category } = req.query;
    const query = category ? `?category=${encodeURIComponent(category)}` : '';

    const response = await fetch(`${getApiUrl(env)}/api/v1/connectors/templates${query}`, {
      headers: {
        'Authorization': req.headers.get('Authorization') || '',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[templates] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// POST /api/v1/connectors/templates (Admin)
router.post('', async (req: any, env?: Record<string, string>) => {
  try {
    const input = await req.json();

    const response = await fetch(`${getApiUrl(env)}/api/v1/connectors/templates`, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.get('Authorization') || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[templates POST] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
