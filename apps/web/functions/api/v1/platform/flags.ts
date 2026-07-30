import {
  json,
  options,
  platformAdminFromEnv,
  requireAuth,
  type Env,
} from '../../../shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }

  const auth = await requireAuth(context.env, context.request);
  if (auth instanceof Response) return auth;

  if (!platformAdminFromEnv(context.env, auth.email)) {
    return json({ statusCode: 403, message: 'Platform admin only' }, 403);
  }

  return json([
    {
      key: 'ellinea_chat',
      label: 'Ellinea chat',
      enabled: false,
      note: 'Unlocks Ask Ellinea production chat',
    },
    {
      key: 'live_connectors',
      label: 'Live connectors',
      enabled: false,
      note: 'Integration Hub sync to Command Center',
    },
    {
      key: 'ceo_daily_brief',
      label: 'CEO Daily Brief',
      enabled: false,
      note: 'Automated morning summary delivery',
    },
  ]);
};
