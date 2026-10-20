import type { EventSummaryDto } from "@cinebook/shared";

const preferredTitles = ["Dune: Part Two", "Oppenheimer: 70mm", "Kalki 2898 AD", "Interstellar: 10th Anniversary", "Coldplay: Music of the Spheres", "A.R. Rahman: Symphony Live", "Diljit Dosanjh: Dil-Luminati Tour"];

/** One feature per title/content, not one slide for every repeat screening. */
export function featuredShows<T extends Pick<EventSummaryDto, "id" | "contentId" | "title" | "type" | "status">>(events: readonly T[]): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.status !== "PUBLISHED") return false;
    const identity = `${event.type}:${event.contentId || event.title.trim().replace(/\s+/g, " ").toLowerCase()}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).sort((left, right) => {
    const rank = (title: string) => { const index = preferredTitles.indexOf(title); return index < 0 ? preferredTitles.length : index; };
    return rank(left.title) - rank(right.title);
  });
}

export function nextFeaturedIndex(index: number, direction: -1 | 1, count: number) {
  return count > 0 ? ((index + direction) % count + count) % count : 0;
}
