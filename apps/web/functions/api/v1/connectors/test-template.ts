import { Router } from 'itty-router';

const router = Router({ base: '/api/v1/connectors/test-template' });

// POST /api/v1/connectors/test-template
router.post('', async (req: any) => {
  try {
    const input = await req.json();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/connectors/test-template`,
      {
        method: 'POST',
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
    console.error('[test-template] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

export const onRequest = router.handle;
