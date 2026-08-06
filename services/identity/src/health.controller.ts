import { Controller, Get } from '@nestjs/common';

const startedAt = Date.now();

function resolveEmailProvider(): 'resend' | 'smtp' | 'none' {
  if (process.env.RESEND_API_KEY || process.env.ELLINEA_SMTP_API_KEY) return 'resend';
  const host = process.env.SMTP_HOST || process.env.ELLINEA_SMTP_HOST || '';
  const user = process.env.SMTP_USER || process.env.ELLINEA_SMTP_USER || '';
  const pass = process.env.SMTP_PASS || process.env.ELLINEA_SMTP_PASS || '';
  if (host && user && pass) return 'smtp';
  return 'none';
}

@Controller('health')
export class HealthController {
  @Get()
  check() {
    const emailProvider = resolveEmailProvider();
    const now = new Date().toISOString();
    return {
      status: 'ok',
      service: 'identity',
      product: 'Ellines EIP',
      // Legacy field kept for backward compat
      timestamp: now,
      // HealthDto fields expected by the web app
      version: process.env.npm_package_version || '0.1.0',
      ts: now,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      email: {
        provider: emailProvider,
        live: emailProvider !== 'none',
      },
    };
  }
}
