import source from '../../public/cache-policy.js?raw';

export type CacheAction = 'bypass' | 'cache-first' | 'navigate';
export interface CacheRequest { url: string; method?: string; mode?: string; hasAuthorization?: boolean; origin: string }

// The service worker loads this same file with importScripts, so the rule is written once.
const scope: { EcclesiaCachePolicy?: { decide: (req: CacheRequest) => CacheAction } } = {};
new Function('self', `${source}`).call(scope, scope);

export const decideCacheAction = (req: CacheRequest): CacheAction => scope.EcclesiaCachePolicy!.decide(req);
