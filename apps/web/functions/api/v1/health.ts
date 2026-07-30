import { json, options, type Env } from '../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  return json({ status: 'ok', service: 'ellines-eip-identity-pages', ts: new Date().toISOString() });
};
