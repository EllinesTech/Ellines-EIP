import { All, Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

type Upstream = {
  id: string;
  baseUrl: string;
  prefix: string;
};

function upstreams(): Upstream[] {
  return [
    {
      id: 'identity',
      baseUrl: (process.env.IDENTITY_URL || 'http://localhost:3001').replace(/\/$/, ''),
      prefix: '/auth',
    },
    {
      id: 'identity-orgs',
      baseUrl: (process.env.IDENTITY_URL || 'http://localhost:3001').replace(/\/$/, ''),
      prefix: '/orgs',
    },
    {
      id: 'identity-enterprise',
      baseUrl: (process.env.IDENTITY_URL || 'http://localhost:3001').replace(/\/$/, ''),
      prefix: '/enterprise',
    },
    {
      id: 'ellinea',
      baseUrl: (process.env.ELLINEA_URL || 'http://localhost:3002').replace(/\/$/, ''),
      prefix: '/ellinea',
    },
  ];
}

@Controller()
export class GatewayController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'api-gateway',
      version: '0.1.0',
      upstreams: upstreams().map((u) => ({ id: u.id, baseUrl: u.baseUrl, prefix: u.prefix })),
    };
  }

  @Get('gateway/routes')
  routes() {
    return {
      message: 'EIP API Gateway — proxies /api/v1/* to Identity / Ellinea by path prefix.',
      routes: upstreams(),
      note: 'Cloudflare Pages Functions remain the live edge for static hosting; this service is for Fly/K8s deployments.',
    };
  }

  @All('*')
  async proxy(@Req() req: Request, @Res() res: Response) {
    const path = req.path.startsWith('/') ? req.path : `/${req.path}`;
    // Nest strips global prefix; path is relative to /api/v1
    const match = upstreams().find((u) => path === u.prefix || path.startsWith(`${u.prefix}/`));
    if (!match) {
      return res.status(404).json({
        statusCode: 404,
        message: `No upstream for ${path}. See GET /api/v1/gateway/routes`,
      });
    }

    const target = `${match.baseUrl}/api/v1${path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
    const headers: Record<string, string> = {};
    const auth = req.headers.authorization;
    if (typeof auth === 'string') headers.authorization = auth;
    if (req.headers['content-type']) {
      headers['content-type'] = String(req.headers['content-type']);
    }

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get('content-type');
      if (ct) res.setHeader('content-type', ct);
      return res.send(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream failed';
      return res.status(502).json({
        statusCode: 502,
        message: `Bad gateway to ${match.id}`,
        detail: message,
        target,
      });
    }
  }
}
