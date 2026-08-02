import { Router } from 'itty-router';

const router = Router();

// GET /api/v1/dashboards/:id
router.get('/api/v1/dashboards/:id', async (req: any) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.query;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/dashboards/${id}?organizationId=${organizationId}`,
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

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[dashboards/:id] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// PATCH /api/v1/dashboards/:id
router.patch('/api/v1/dashboards/:id', async (req: any) => {
  try {
    const { id } = req.params;
    const input = await req.json();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/dashboards/${id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': req.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      },
    );

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[dashboards/:id PATCH] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// DELETE /api/v1/dashboards/:id
router.delete('/api/v1/dashboards/:id', async (req: any) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.query;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/dashboards/${id}?organizationId=${organizationId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': req.headers.get('Authorization') || '',
        },
      },
    );

    if (!response.ok) {
      return new Response(await response.text(), { status: response.status });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[dashboards/:id DELETE] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
