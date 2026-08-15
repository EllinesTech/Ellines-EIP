import { Controller, Get } from '@nestjs/common';

const startedAt = Date.now();

@Controller('health')
export class HealthController {
  @Get()
  check() {
    const now = new Date().toISOString();
    return {
      status: 'ok',
      service: 'model-orchestrator',
      product: 'Ellines EIP',
      timestamp: now,
      version: process.env['npm_package_version'] ?? '0.1.0',
      ts: now,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }
}
