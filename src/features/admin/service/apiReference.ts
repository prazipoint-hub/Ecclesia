import type { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import type { PermissionGuard } from '@/middleware/authorization';

export type Mount = { path: string; router: Router };
export type EndpointInfo = { method: string; path: string; authenticated: boolean; permission: string | null; params: string[] };

type Layer = { handle: unknown; route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> } };

const isGuard = (fn: unknown): fn is PermissionGuard => typeof fn === 'function' && typeof (fn as Partial<PermissionGuard>).requiredPermission === 'string';
const joinPath = (a: string, b: string) => `${a.replace(/\/$/, '')}${b === '/' ? '' : b}` || '/';

/**
 * Reads the real route tables of the mounted routers, so the list can never drift from the code.
 * It shows the method, path, whether sign-in is required and which permission the route checks.
 * Rules enforced inside a service (ownership, business rules) are not visible here.
 */
export function listEndpoints(mounts: Mount[]): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  for (const { path: base, router } of mounts) {
    const stack = ((router as unknown as { stack?: Layer[] }).stack ?? []) as Layer[];
    let routerAuthenticated = false;
    for (const layer of stack) {
      if (!layer.route) {
        if (layer.handle === authenticate) routerAuthenticated = true;
        continue;
      }
      const handlers = layer.route.stack.map((l) => l.handle);
      const permission = handlers.find(isGuard)?.requiredPermission ?? null;
      const authenticated = routerAuthenticated || handlers.includes(authenticate);
      const full = joinPath(base, layer.route.path);
      for (const method of Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m])) {
        endpoints.push({ method: method.toUpperCase(), path: full, authenticated, permission, params: [...full.matchAll(/:(\w+)/g)].map((m) => m[1]) });
      }
    }
  }
  return endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

/** A minimal OpenAPI 3 document: enough for Postman or a client generator to see every route and its auth. */
export function buildOpenApi(mounts: Mount[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of listEndpoints(mounts)) {
    const key = e.path.replace(/:(\w+)/g, '{$1}');
    paths[key] ??= {};
    paths[key][e.method.toLowerCase()] = {
      summary: `${e.method} ${e.path}`,
      ...(e.permission ? { description: `Requires permission ${e.permission}.`, 'x-required-permission': e.permission } : {}),
      parameters: e.params.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
      ...(e.authenticated ? { security: [{ bearerAuth: [] }] } : {}),
      responses: { '200': { description: 'Success' } },
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Ecclesia API', version: '2.0.0', description: 'Generated from the live route tables. Request and response bodies are not described.' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}
