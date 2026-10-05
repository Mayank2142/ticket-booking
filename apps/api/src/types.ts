export type RouteParams = Record<string, string>;

export type ApiHandler = (
  request: Request,
  params: RouteParams,
  url: URL
) => Response | Promise<Response>;

export type RouteDefinition = {
  method: string;
  path: string;
  handler: ApiHandler;
};

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}
