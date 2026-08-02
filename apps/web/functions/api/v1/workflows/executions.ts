import { Router } from 'itty-router';

const router = Router({ base: '/api/v1/workflows/executions' });

// GET /api/v1/workflows/executions
router.get('', async (req: any) => {
  try {
    const { organizationId, ruleId, limit } = req.query;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflows/executions?organizationId=${organizationId}`;
    if (ruleId) url += `&ruleId=${ruleId}`;
    if (limit) url += `&limit=${limit}`;

    const response = await fetch(url, {
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
    console.error('[executions] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
