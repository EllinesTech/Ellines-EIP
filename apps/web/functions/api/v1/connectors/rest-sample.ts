import { json, options, type Env } from '../../../shared/auth';
import sample from '../../../shared/rest-enterprise-sample.json';

/** Public sample enterprise JSON for the REST connector default endpoint. */
export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method === 'OPTIONS') return options();
  if (context.request.method !== 'GET') {
    return json({ message: 'Method not allowed' }, 405);
  }
  return json(sample);
};
