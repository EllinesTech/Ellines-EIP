import { Body, Controller, Get, Post } from '@nestjs/common';
import { normalizeEnterprisePayload } from '@ellines-eip/connectors-sdk';

@Controller()
export class HubController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'integration-hub',
      version: '0.1.0',
      note: 'Orchestration stub — live sync remains on Pages Functions + Identity.',
    };
  }

  @Post('hub/normalize')
  normalize(@Body() body: unknown) {
    const payload = normalizeEnterprisePayload(body);
    return {
      ok: true,
      payload,
      message: 'Normalized System B JSON into Universal Enterprise Model fields.',
    };
  }

  @Get('hub/capabilities')
  capabilities() {
    return {
      connectors: [
        'rest-api',
        'openapi',
        'postgres',
        'sqlserver',
        'mysql',
        'csv-file',
        'email-imap',
        'sftp',
        'external-ingest',
        'webhook',
      ],
      ingest: 'POST /api/v1/enterprise/ingest (Pages)',
      webhook: 'POST /api/v1/webhooks/enterprise (Pages)',
      normalize: 'POST /api/v1/hub/normalize (this service)',
    };
  }
}
