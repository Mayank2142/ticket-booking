export function ok<T>(data: T, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function err(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
