import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../shared/auth';
import { onItemRequest } from '../connector-packs';

export const onRequest: PagesFunction<Env> = onItemRequest as PagesFunction<Env>;