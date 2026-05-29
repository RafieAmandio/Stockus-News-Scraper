import { readFileSync } from "fs";
import { join } from "path";
import { getBrowser } from "./browser.ts";
import type { ScrapedItem } from "../types.ts";

interface WebSource {
  name: string;
  url: string;
  scrape: (page: import("playwright-core").Page) => Promise<ScrapedItem[]>;
}

const ALL_SOURCES: WebSource[] = [
  {
    name: "brookfield",
    url: "https://privatewealth.brookfield.com/insights",
    scrape: async (page) => {
      await page.waitForTimeout(3000);
      const items: ScrapedItem[] = [];
      const articles = await page.$$eval("article", (els) =>
        els.slice(0, 5).map((el) => ({
          text: el.innerText?.trim() ?? "",
          href: el.querySelector("a")?.href ?? "",
        }))
      );

      for (const a of articles) {
        if (a.text.length < 50) continue;
        const lines = a.text.split("\n").filter((l) => l.trim());
        items.push({
          source: "web:brookfield",
          title: lines[1] ?? lines[0],
          content: a.text.slice(0, 3000),
          url: a.href || undefined,
        });
      }
      return items;
    },
  },
  {
    name: "capitalistletters",
    url: "https://substack.com/@capitalistletters",
    scrape: async (page) => {
      await page.waitForTimeout(3000);
      const items: ScrapedItem[] = [];

      const posts = await page.$$eval("article", (els) =>
        els.slice(0, 5).map((el) => {
          const titleEl = el.querySelector("h2, h3, [class*='title']");
          const linkEl = el.querySelector("a[href*='capitalist-letters.com/p/']") ?? el.querySelector("a[href]");
          return {
            title: titleEl?.innerText?.trim() ?? el.innerText?.trim().split("\n")[0] ?? "",
            text: el.innerText?.trim() ?? "",
            href: linkEl?.href ?? "",
          };
        })
      );

      for (const p of posts) {
        if (p.text.length < 50) continue;
        items.push({
          source: "web:capitalistletters",
          title: p.title,
          content: p.text.slice(0, 3000),
          url: p.href || undefined,
          author: "Capitalist Letters",
        });
      }

      if (items.length === 0) {
        const text = await page.innerText("main, body");
        if (text.length > 100) {
          items.push({
            source: "web:capitalistletters",
            title: await page.title(),
            content: text.slice(0, 3000),
            url: page.url(),
            author: "Capitalist Letters",
          });
        }
      }
      return items;
    },
  },
  {
    name: "apolloacademy",
    url: "https://www.apollo.com/wealth/the-daily-spark",
    scrape: async (page) => {
      await page.waitForTimeout(4000);
      const items: ScrapedItem[] = [];

      const articles = await page.$$eval("a", (els) =>
        els
          .filter((el) => el.href?.includes("/the-daily-spark/") && el.innerText?.trim().length > 10)
          .slice(0, 5)
          .map((el) => ({
            title: el.innerText.trim(),
            href: el.href,
          }))
      );

      for (const a of articles) {
        items.push({
          source: "web:apolloacademy",
          title: a.title,
          content: a.title,
          url: a.href,
        });
      }

      // Try to fetch actual article content for each
      const browser = page.context().browser();
      if (browser) {
        for (const item of items.slice(0, 3)) {
          if (!item.url) continue;
          const articlePage = await browser.newPage();
          try {
            await articlePage.goto(item.url, { waitUntil: "domcontentloaded", timeout: 20000 });
            await articlePage.waitForTimeout(2000);
            const content = await articlePage.innerText("main, article, body");
            if (content.length > 100) {
              item.content = content.slice(0, 3000);
            }
          } catch {} finally {
            await articlePage.close();
          }
        }
      }

      return items;
    },
  },
  {
    name: "goldmansachs",
    url: "https://www.goldmansachs.com/insights/reports",
    scrape: async (page) => {
      await page.waitForTimeout(3000);
      const items: ScrapedItem[] = [];

      const articles = await page.$$eval("[class*='article']", (els) =>
        els.slice(0, 5).map((el) => ({
          text: el.innerText?.trim() ?? "",
          href: el.querySelector("a")?.href ?? el.getAttribute("href") ?? "",
        }))
      );

      for (const a of articles) {
        if (a.text.length < 50) continue;
        const lines = a.text.split("\n").filter((l) => l.trim());
        const title = lines.find((l) => l.length > 15 && !l.includes("Subscribe") && !l.includes("Explore")) ?? lines[0];
        items.push({
          source: "web:goldmansachs",
          title,
          content: a.text.slice(0, 3000),
          url: a.href || undefined,
        });
      }

      if (items.length === 0) {
        const text = await page.innerText("main, body");
        if (text.length > 200) {
          items.push({
            source: "web:goldmansachs",
            title: await page.title(),
            content: text.slice(0, 3000),
            url: page.url(),
          });
        }
      }
      return items;
    },
  },
];

function loadWebSources(): string[] {
  try {
    const raw = readFileSync(join(process.cwd(), "accounts.json"), "utf-8");
    const parsed = JSON.parse(raw) as { websites?: string[] };
    return parsed.websites ?? ALL_SOURCES.map((s) => s.name);
  } catch {
    return ALL_SOURCES.map((s) => s.name);
  }
}

export async function scrapeWebsites(): Promise<ScrapedItem[]> {
  const enabled = loadWebSources();
  const sources = ALL_SOURCES.filter((s) => enabled.includes(s.name));
  console.log(`  Sources: ${sources.map((s) => s.name).join(", ")}`);

  const browser = await getBrowser();
  const items: ScrapedItem[] = [];

  for (const source of sources) {
    console.log(`  Scraping ${source.name}...`);
    const page = await browser.newPage();

    try {
      await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const scraped = await source.scrape(page);
      const filtered = scraped.filter((item) => item.content.length >= 50);
      items.push(...filtered.slice(0, 5));
      console.log(`  ${source.name}: ${filtered.length} articles found`);
    } catch (err) {
      console.error(`  Failed ${source.name}:`, (err as Error).message);
    } finally {
      await page.close();
    }
  }

  return items;
}
