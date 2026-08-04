import { json, options, mailProviderLabel, type Env } from '../../shared/auth';

const START_TIME = Date.now();

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();

  const emailProvider = mailProviderLabel(context.env as Parameters<typeof mailProviderLabel>[0]);

  return json({
    status: 'ok',
    service: 'ellines-eip-pages',
    version: '1.0.0',
    ts: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - START_TIME) / 1000),
    email: {
      provider: emailProvider,
      live: emailProvider !== 'none',
    },
  });
};
