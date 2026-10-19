/** Preserve the screening month/day, clamping leap day to February 28 in 2030. */
export function movieDateIn2030(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid screening date: ${date}`);
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid screening date: ${date}`);
  }
  return date.endsWith("-02-29") ? "2030-02-28" : `2030${date.slice(4)}`;
}
