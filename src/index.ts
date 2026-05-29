import { scrapeTwitter } from "./scrapers/twitter.ts";
import { scrapeWebsites } from "./scrapers/websites.ts";
import { scrapeSubstacks } from "./scrapers/substack.ts";
import { closeBrowser } from "./scrapers/browser.ts";
import { generateInstagramPost } from "./ai/instagram.ts";
import { generateDailyBriefing } from "./ai/briefing.ts";
import { printPost, savePosts, printBriefing, saveBriefing } from "./output/formatter.ts";
import type { ScrapedItem, InstagramPost } from "./types.ts";

type Source = "twitter" | "web" | "substack" | "all";
type Mode = "posts" | "briefing";

function parseArgs(): { source: Source; limit: number; save: boolean; mode: Mode } {
  const args = process.argv.slice(2);
  let source: Source = "all";
  let limit = 10;
  let save = false;
  let mode: Mode = "posts";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      const val = args[i + 1];
      if (val === "twitter" || val === "web" || val === "substack" || val === "all") source = val;
      i++;
    }
    if (args[i] === "--limit" && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === "--save") {
      save = true;
    }
    if (args[i] === "--mode" && args[i + 1]) {
      const val = args[i + 1];
      if (val === "posts" || val === "briefing") mode = val;
      i++;
    }
  }

  return { source, limit, save, mode };
}

function deduplicate(items: ScrapedItem[]): ScrapedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.content.slice(0, 100).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const { source, limit, save, mode } = parseArgs();

  console.log(`\nStockUs News Scraper`);
  console.log(`Source: ${source} | Mode: ${mode} | Limit: ${limit} | Save: ${save}`);
  console.log("");

  let scraped: ScrapedItem[] = [];

  if (source === "twitter" || source === "all") {
    console.log("[Twitter] Scraping accounts...");
    const tweets = await scrapeTwitter();
    console.log(`[Twitter] Got ${tweets.length} items\n`);
    scraped.push(...tweets);
  }

  if (source === "web" || source === "all") {
    console.log("[Web] Scraping websites...");
    const articles = await scrapeWebsites();
    console.log(`[Web] Got ${articles.length} items\n`);
    scraped.push(...articles);
  }

  if (source === "substack" || source === "all") {
    console.log("[Substack] Fetching RSS feeds...");
    const articles = await scrapeSubstacks();
    console.log(`[Substack] Got ${articles.length} items\n`);
    scraped.push(...articles);
  }

  scraped = deduplicate(scraped).slice(0, limit);

  if (scraped.length === 0) {
    console.log("No content scraped. Check your sources and API token.");
    process.exit(1);
  }

  if (mode === "briefing") {
    console.log(`[AI] Generating daily briefing from ${scraped.length} items...\n`);
    const briefing = await generateDailyBriefing(scraped);
    printBriefing(briefing);
    if (save) {
      saveBriefing(briefing, "output");
    }
    console.log(`\nDone. Daily briefing generated from ${scraped.length} scraped items.`);
  } else {
    console.log(`[AI] Generating ${scraped.length} Instagram posts...\n`);

    const posts: InstagramPost[] = [];
    for (let i = 0; i < scraped.length; i++) {
      const item = scraped[i];
      console.log(`  [${i + 1}/${scraped.length}] Processing: ${item.source} — ${(item.title ?? item.content.slice(0, 50))}...`);
      try {
        const post = await generateInstagramPost(item);
        posts.push(post);
      } catch (err) {
        console.error(`  Failed to generate post for ${item.source}:`, (err as Error).message);
      }
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`GENERATED ${posts.length} INSTAGRAM POSTS`);
    console.log(`${"=".repeat(60)}`);

    for (let i = 0; i < posts.length; i++) {
      printPost(posts[i], i);
    }

    if (save) {
      savePosts(posts, "output");
    }

    console.log(`\nDone. ${posts.length} posts generated from ${scraped.length} scraped items.`);
  }

  await closeBrowser();
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await closeBrowser();
  process.exit(1);
});
