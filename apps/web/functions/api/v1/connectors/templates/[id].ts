import { Router } from 'itty-router';

const router = Router();

// GET /api/v1/connectors/templates/:id
router.get('/api/v1/connectors/templates/:id', async (req: any) => {
  try {
    const { id } = req.params;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/connectors/templates/${id}`,
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
    console.error('[templates/:id] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// PATCH /api/v1/connectors/templates/:id (Admin)
router.patch('/api/v1/connectors/templates/:id', async (req: any) => {
  try {
    const { id } = req.params;
    const input = await req.json();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/connectors/templates/${id}`,
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
    console.error('[templates/:id PATCH] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// DELETE /api/v1/connectors/templates/:id (Admin)
router.delete('/api/v1/connectors/templates/:id', async (req: any) => {
  try {
    const { id } = req.params;

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/connectors/templates/${id}`,
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
    console.error('[templates/:id DELETE] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
