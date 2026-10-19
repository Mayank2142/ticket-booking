import { createHash } from "node:crypto";

type ResendMessage = { from: string; to: string; subject: string; html: string; text: string; attachments?: Array<{ filename: string; content: string }> };

/** HTTPS delivery works where hosts block outbound SMTP. Never log the API key. */
export async function sendResendMessage(message: ResendMessage, apiKey: string, http: typeof fetch = fetch) {
  const body = JSON.stringify(message);
  const key = createHash("sha256").update(body).digest("hex");
  const response = await http("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `cinebook/${key}` },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Resend rejected delivery (HTTP ${response.status}). Check the API key, verified sender domain and permitted recipient.`);
  const result = await response.json() as { id?: unknown };
  if (typeof result.id !== "string") throw new Error("Resend did not acknowledge the message; delivery will be retried.");
  return { messageId: result.id };
}
