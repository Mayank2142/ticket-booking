import { sessionCookie, signToken, type AuthUser } from "./auth";

/** Browser sessions never expose the bearer credential to application JavaScript. */
export async function authenticatedResponse(request: Request, user: AuthUser, extra: Record<string, unknown> = {}, status = 200) {
  const token = await signToken(user);
  const browserSession = request.headers.get("x-cinebook-session") === "cookie";
  return Response.json({ user, ...extra, token: browserSession ? "" : token }, {
    status,
    headers: { "Cache-Control": "no-store", ...(browserSession ? { "Set-Cookie": sessionCookie(token) } : {}) },
  });
}
