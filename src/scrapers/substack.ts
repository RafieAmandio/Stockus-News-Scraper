import { readFileSync } from "fs";
import { join } from "path";
import { XMLParser } from "fast-xml-parser";
import type { ScrapedItem, SubstackSource } from "../types.ts";

function loadSubstackSources(): SubstackSource[] {
  try {
    const raw = readFileSync(join(process.cwd(), "accounts.json"), "utf-8");
    const parsed = JSON.parse(raw) as {
      substacks?: (string | { name: string; feedUrl: string })[];
    };
    return (parsed.substacks ?? []).map((s) => {
      if (typeof s === "string") {
        return { name: s, feedUrl: `https://${s}.substack.com/feed` };
      }
      return s;
    });
  } catch {
    return [];
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function scrapeSubstacks(maxPerFeed = 5): Promise<ScrapedItem[]> {
  const sources = loadSubstackSources();
  if (sources.length === 0) return [];

  console.log(`  Feeds: ${sources.map((s) => s.name).join(", ")}`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const items: ScrapedItem[] = [];

  for (const source of sources) {
    console.log(`  Fetching ${source.name}...`);
    try {
      const res = await fetch(source.feedUrl, {
        headers: { "User-Agent": "StockUs-News-Scraper/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error(`  ${source.name}: HTTP ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const parsed = parser.parse(xml);

      const feedItems =
        parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
      const articleList = Array.isArray(feedItems) ? feedItems : [feedItems];

      let count = 0;
      for (const article of articleList.slice(0, maxPerFeed)) {
        const title = article.title ?? "";
        const raw =
          article["content:encoded"] ??
          article.description ??
          article.summary ??
          article.content ??
          "";
        const content = stripHtml(typeof raw === "string" ? raw : "");
        const link = article.link?.["@_href"] ?? article.link ?? "";
        const pubDate =
          article.pubDate ?? article["dc:date"] ?? article.published ?? "";
        const author =
          article["dc:creator"] ?? article.author?.name ?? source.name;

        if (content.length < 50 && String(title).length < 10) continue;

        items.push({
          source: `substack:${source.name}`,
          title: typeof title === "string" ? title : String(title),
          content: content.slice(0, 3000) || String(title),
          url: typeof link === "string" ? link : "",
          date: typeof pubDate === "string" ? pubDate : undefined,
          author: typeof author === "string" ? author : source.name,
        });
        count++;
      }

      console.log(`  ${source.name}: ${count} articles found`);
    } catch (err) {
      console.error(`  Failed ${source.name}:`, (err as Error).message);
    }
  }

  return items;
}
