import { readFileSync } from "fs";
import { join } from "path";
import { getBrowser } from "./browser.ts";
import type { ScrapedItem } from "../types.ts";

function loadAccounts(): string[] {
  try {
    const raw = readFileSync(join(process.cwd(), "accounts.json"), "utf-8");
    const parsed = JSON.parse(raw) as { twitter?: string[] };
    return parsed.twitter ?? [];
  } catch {
    return ["firstsquawk", "financialjuice", "Mayhem4Markets", "Eliant_capital"];
  }
}

export async function scrapeTwitter(maxPerAccount = 20): Promise<ScrapedItem[]> {
  const accounts = loadAccounts();
  console.log(`  Accounts: ${accounts.map((a) => `@${a}`).join(", ")}`);

  const browser = await getBrowser();
  const items: ScrapedItem[] = [];

  for (const handle of accounts) {
    console.log(`  Scraping @${handle}...`);
    const page = await browser.newPage();

    try {
      await page.goto(`https://x.com/${handle}`, { waitUntil: "domcontentloaded", timeout: 30000 });

      await page.waitForSelector('[data-testid="tweetText"]', { timeout: 15000 });

      let previousCount = 0;
      for (let scroll = 0; scroll < 3; scroll++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await page.waitForTimeout(1500);
        const currentCount = await page.locator('[data-testid="tweet"]').count();
        if (currentCount >= maxPerAccount || currentCount === previousCount) break;
        previousCount = currentCount;
      }

      const tweets = await page.$$('[data-testid="tweet"]');
      let count = 0;

      for (const tweet of tweets.slice(0, maxPerAccount)) {
        try {
          const textEl = await tweet.$('[data-testid="tweetText"]');
          const text = textEl ? await textEl.innerText() : "";
          if (text.length < 30) continue;

          const timeEl = await tweet.$("time");
          const dateTime = timeEl ? await timeEl.getAttribute("datetime") : undefined;

          const linkEl = await tweet.$('a[href*="/status/"]');
          const href = linkEl ? await linkEl.getAttribute("href") : undefined;
          const url = href ? `https://x.com${href}` : undefined;

          items.push({
            source: `twitter:${handle}`,
            content: text,
            url,
            date: dateTime ?? undefined,
            author: `@${handle}`,
          });
          count++;
        } catch {}
      }

      console.log(`  @${handle}: ${count} tweets scraped`);
    } catch (err) {
      console.error(`  Failed @${handle}:`, (err as Error).message);
    } finally {
      await page.close();
    }
  }

  return items;
}
