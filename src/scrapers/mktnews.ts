import type { ScrapedItem } from "../types.ts";

interface MktNewsFlashItem {
  id: string;
  time: string;
  important: 0 | 1;
  data: { content: string; title: string | null };
  impact: Array<{ impact: "bullish" | "bearish" | "none"; symbol: string }> | null;
}

interface MktNewsResponse {
  status: number;
  data: MktNewsFlashItem[];
}

function isRecent(dateStr: string, maxAgeHours: number): boolean {
  try {
    const published = new Date(dateStr).getTime();
    if (isNaN(published)) return true;
    return Date.now() - published < maxAgeHours * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

const US_SYMBOLS = new Set(["S&P500", "SPX", "DJI", "Dow", "Nasdaq", "Russell", "DXY"]);

function isUSRelevant(impact: MktNewsFlashItem["impact"]): boolean {
  if (!impact || impact.length === 0) return false;
  return impact.some(
    (i) =>
      i.symbol.endsWith(".O") ||
      i.symbol.endsWith(".N") ||
      US_SYMBOLS.has(i.symbol)
  );
}

function formatImpact(
  impact: MktNewsFlashItem["impact"]
): string {
  if (!impact || impact.length === 0) return "";
  const parts = impact
    .filter((i) => i.impact !== "none")
    .map((i) => `[${i.impact.toUpperCase()}: ${i.symbol}]`);
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

export async function scrapeMktNews(
  limit = 50,
  maxAgeHours = 6
): Promise<ScrapedItem[]> {
  console.log(`  Filter: important only, last ${maxAgeHours}h`);

  const url = `https://api.mktnews.net/api/flash?important=1&limit=${limit}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "StockUs-News-Scraper/1.0" },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    console.error(`  MKTNews: HTTP ${res.status}`);
    return [];
  }

  const json = (await res.json()) as MktNewsResponse;

  if (json.status !== 200 || !Array.isArray(json.data)) {
    console.error(`  MKTNews: unexpected response`);
    return [];
  }

  const items: ScrapedItem[] = [];
  let skipped = 0;

  for (const entry of json.data) {
    if (!isRecent(entry.time, maxAgeHours)) {
      skipped++;
      continue;
    }

    if (!isUSRelevant(entry.impact)) continue;

    const content = entry.data.content?.trim();
    if (!content || content.length < 20) continue;

    items.push({
      source: "mktnews:flash",
      title: entry.data.title ?? undefined,
      content: content + formatImpact(entry.impact),
      date: entry.time,
      author: "MKTNews",
    });
  }

  console.log(
    `  MKTNews: ${items.length} important items${skipped > 0 ? ` (${skipped} older skipped)` : ""}`
  );

  return items;
}
