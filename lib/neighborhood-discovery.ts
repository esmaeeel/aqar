import { AQAR_ORIGIN, listingLinks, locationUrl, type Filters } from "@/lib/aqar";
import { canonicalCity, neighborhoodsMatch } from "@/lib/locations";

export type SourcePage = { html: string; url: string };
export type SourceDiscovery = { pending: string[]; visited: string[] };
type Scope = { category: string; city: string; neighborhood: string; purpose: Filters["purpose"] };
const BATCH_SIZE = 2;
export const MAX_DISCOVERY_PAGES = 200;
export const SOURCE_UNRESOLVED = "تعذر تحديد مصدر الحي في صفحات عقار العامة؛ هذا لا يعني عدم وجود عروض فيه.";
const sourceCache = new Map<string, { url: string; expires: number }>();
const words = (text: string) => text.replace(/-/g, " ");

// Only location directories under the selected category/city may be followed.
// No off-site URLs, listing pages, arbitrary queries, or guessed neighborhood aliases.
export function sourceDirectory(url: string, scope: Pick<Scope, "category" | "city">) {
  try {
    const parsed = new URL(url, AQAR_ORIGIN);
    if (parsed.origin !== AQAR_ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2 || parts.length > 4 || parts[0] !== scope.category
      || canonicalCity(words(parts[1])) !== canonicalCity(scope.city)) return null;
    const tail = parts.slice(2);
    if (tail.some(part => !part || /[/\\?#]|-\d{5,}$/.test(part))) return null;
    if (tail.length && !/^حي-/.test(tail.at(-1)!)
      && !(tail.length === 1 && /^(?:شمال|جنوب|شرق|غرب|وسط)-/.test(tail[0]))) return null;
    if (tail.length === 2 && !/^(?:شمال|جنوب|شرق|غرب|وسط)-/.test(tail[0])) return null;
    return `${AQAR_ORIGIN}/${parts.map(encodeURIComponent).join("/")}`;
  } catch { return null; }
}

export function directoryMatchesNeighborhood(url: string, scope: Scope) {
  const directory = sourceDirectory(url, scope);
  if (!directory) return false;
  const name = decodeURIComponent(new URL(directory).pathname.split("/").at(-1)!);
  return /^حي-/.test(name) && neighborhoodsMatch(scope.city, words(name), scope.neighborhood);
}

export function directoryPageUrl(base: string, page: number) {
  return page > 1 ? `${base}/${page}` : base;
}

export function locationDirectories(html: string, scope: Scope) {
  const directories = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const directory = sourceDirectory(match[1].replace(/&amp;/g, "&"), scope);
    if (directory) directories.add(directory);
  }
  return [...directories];
}

function listingDirectory(url: string, scope: Scope) {
  try {
    const parsed = new URL(url), parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const listingIndex = parts.findIndex(part => /-\d{5,}$/.test(part));
    if (listingIndex < 3) return null;
    // General searches can use the same geographic directory, without changing purpose.
    const parent = parts.slice(0, listingIndex); parent[0] = scope.category;
    return sourceDirectory(`${parsed.origin}/${parent.map(encodeURIComponent).join("/")}`, scope);
  } catch { return null; }
}

function cacheSource(key: string, url: string) {
  if (sourceCache.size >= 256) sourceCache.delete(sourceCache.keys().next().value!);
  sourceCache.set(key, { url, expires: Date.now() + 3_600_000 });
  return { sourceBaseUrl: url };
}

export function forgetDiscoveredSource(scope: Scope) { sourceCache.delete(JSON.stringify(scope)); }

// Batch the traversal so a large city never requires one long Worker request.
// The browser continues with the SAME trial token. Successful routes are cached,
// and no negative result is cached or reported as "no listings".
export async function discoverNeighborhoodSource(
  scope: Scope,
  readPage: (url: string) => Promise<SourcePage>,
  continuation?: SourceDiscovery,
): Promise<{ sourceBaseUrl: string; sourceDiscovery?: never } | { sourceDiscovery: SourceDiscovery; sourceBaseUrl?: never }> {
  const key = JSON.stringify(scope), cached = sourceCache.get(key);
  if (!continuation && cached && cached.expires > Date.now()) return { sourceBaseUrl: cached.url };
  const clean = (urls: unknown) => Array.isArray(urls)
    ? [...new Set(urls.slice(0, MAX_DISCOVERY_PAGES + 1).map(url => typeof url === "string" ? sourceDirectory(url, scope) : null).filter((url): url is string => !!url))] : [];
  const visited = new Set(clean(continuation?.visited));
  const pending = clean(continuation?.pending ?? [locationUrl(scope.category, scope.city, scope.neighborhood, 1), locationUrl(scope.category, scope.city, "", 1)]).filter(url => !visited.has(url));
  const group = (url: string) => new URL(url).pathname.split("/").slice(0, 4).join("/");
  for (let step = 0; pending.length && step < BATCH_SIZE && visited.size < MAX_DISCOVERY_PAGES; step++) {
    // Visit city/direction indexes first, then alternate directions rather than
    // exhausting every neighborhood in one direction before examining another.
    const groupCounts = new Map<string, number>();
    for (const url of visited) groupCounts.set(group(url), (groupCounts.get(group(url)) || 0) + 1);
    const ranks = new Map(pending.map(url => [url, [Number(!directoryMatchesNeighborhood(url, scope)), new URL(url).pathname.split("/").length, groupCounts.get(group(url)) || 0]]));
    pending.sort((a, b) => { const left = ranks.get(a)!, right = ranks.get(b)!; return left[0] - right[0] || left[1] - right[1] || left[2] - right[2]; });
    const requested = pending.shift()!; visited.add(requested);
    if (step) await new Promise(resolve => setTimeout(resolve, 350));
    let page: SourcePage;
    try { page = await readPage(requested); }
    catch (error) {
      // A missing directory can be rediscovered; protection/connection errors must stop.
      if (error instanceof Error && /\((?:404|410)\)/.test(error.message)) continue;
      throw error;
    }
    const actual = sourceDirectory(page.url, scope);
    if (actual && directoryMatchesNeighborhood(actual, scope)) return cacheSource(key, actual);
    const matching = listingLinks(page.html, scope.category, scope.city, scope.neighborhood, scope.purpose);
    for (const listing of matching) {
      const parent = listingDirectory(listing.url, scope);
      if (parent) return cacheSource(key, parent);
    }
    // Ignore navigation from redirects to the nationwide feed; retain selected-city links only.
    for (const next of locationDirectories(page.html, scope)) {
      if (directoryMatchesNeighborhood(next, scope)) return cacheSource(key, next);
      if (!visited.has(next) && !pending.includes(next) && pending.length + visited.size <= MAX_DISCOVERY_PAGES) pending.push(next);
    }
  }
  if (!pending.length || visited.size >= MAX_DISCOVERY_PAGES) throw new Error(SOURCE_UNRESOLVED);
  return { sourceDiscovery: { pending, visited: [...visited] } };
}
