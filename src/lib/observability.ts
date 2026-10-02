export type LogLevel = "info" | "warn" | "error";

export function structuredLog(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {}
) {
  const entry = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export function safeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
}
