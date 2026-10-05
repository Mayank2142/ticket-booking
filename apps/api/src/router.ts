import type { ApiHandler, RouteDefinition, RouteParams } from "./types";

type CompiledRoute = RouteDefinition & { segments: string[] };

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(method: string, path: string, handler: ApiHandler) {
    this.routes.push({ method: method.toUpperCase(), path, handler, segments: splitPath(path) });
    return this;
  }

  addAll(routes: RouteDefinition[]) {
    for (const route of routes) this.add(route.method, route.path, route.handler);
    return this;
  }

  async handle(request: Request) {
    const url = new URL(request.url);
    const requestSegments = splitPath(url.pathname);

    for (const route of this.routes) {
      if (route.method !== request.method.toUpperCase()) continue;
      const params = matchSegments(route.segments, requestSegments);
      if (params) return route.handler(request, params, url);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
}

function splitPath(path: string) {
  return path.split("/").filter(Boolean);
}

function matchSegments(pattern: string[], actual: string[]): RouteParams | null {
  if (pattern.length !== actual.length) return null;
  const params: RouteParams = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index];
    const value = actual[index];
    if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(value);
    else if (expected !== value) return null;
  }
  return params;
}
