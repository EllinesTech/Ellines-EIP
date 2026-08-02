import { Router } from 'itty-router';

const router = Router({ base: '/api/v1/workflows/rules' });

// GET /api/v1/workflows/rules
router.get('', async (req: any) => {
  try {
    const { organizationId, autonomyLevel } = req.query;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflows/rules?organizationId=${organizationId}`;
    if (autonomyLevel) {
      url += `&autonomyLevel=${autonomyLevel}`;
    }

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
    console.error('[workflows/rules] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// POST /api/v1/workflows/rules
router.post('', async (req: any) => {
  try {
    const input = await req.json();

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflows/rules`, {
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
    console.error('[workflows/rules POST] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
