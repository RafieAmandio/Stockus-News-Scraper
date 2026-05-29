import { Bot, Context } from "grammy";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import cron from "node-cron";
import { config } from "./config.ts";
import { scrapeTwitter } from "./scrapers/twitter.ts";
import { scrapeWebsites } from "./scrapers/websites.ts";
import { scrapeSubstacks } from "./scrapers/substack.ts";
import { closeBrowser } from "./scrapers/browser.ts";
import { generateInstagramPost } from "./ai/instagram.ts";
import { generateDailyBriefing } from "./ai/briefing.ts";
import { formatPostForTelegram, formatCaptionCopyable, formatBriefingForTelegram } from "./output/telegram.ts";
import type { ScrapedItem, InstagramPost } from "./types.ts";

if (!config.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required to run the bot. Get one from @BotFather on Telegram.");
}

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

const activeSessions = new Set<number>();

const SUBSCRIBERS_FILE = join(process.cwd(), "subscribers.json");

function loadSubscribers(): Set<number> {
  try {
    if (existsSync(SUBSCRIBERS_FILE)) {
      const raw = readFileSync(SUBSCRIBERS_FILE, "utf-8");
      const ids = JSON.parse(raw) as number[];
      return new Set(ids);
    }
  } catch {}
  return new Set();
}

function saveSubscribers(subs: Set<number>): void {
  writeFileSync(SUBSCRIBERS_FILE, JSON.stringify([...subs], null, 2));
}

const subscribers = loadSubscribers();

function deduplicate(items: ScrapedItem[]): ScrapedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.content.slice(0, 100).toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeAll(limit: number): Promise<ScrapedItem[]> {
  let scraped: ScrapedItem[] = [];

  try {
    const tweets = await scrapeTwitter();
    scraped.push(...tweets);
  } catch (err) {
    console.error("Twitter scrape failed:", (err as Error).message);
  }

  try {
    const articles = await scrapeWebsites();
    scraped.push(...articles);
  } catch (err) {
    console.error("Web scrape failed:", (err as Error).message);
  }

  try {
    const substackArticles = await scrapeSubstacks();
    scraped.push(...substackArticles);
  } catch (err) {
    console.error("Substack scrape failed:", (err as Error).message);
  }

  return deduplicate(scraped).slice(0, limit);
}

async function handleScrape(
  ctx: Context,
  source: "twitter" | "web" | "substack" | "all",
  limit: number
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  if (activeSessions.has(chatId)) {
    await ctx.reply("A scrape is already running. Please wait for it to finish.");
    return;
  }

  activeSessions.add(chatId);

  try {
    const labels: Record<string, string> = {
      all: "Twitter + Web + Substack",
      twitter: "Twitter",
      web: "Websites",
      substack: "Substack RSS",
    };
    const status = await ctx.reply(
      `Scraping ${labels[source]}... This may take a few minutes.`
    );

    let scraped: ScrapedItem[] = [];

    if (source === "twitter" || source === "all") {
      await ctx.api.editMessageText(
        chatId,
        status.message_id,
        `Scraping Twitter accounts...`
      );
      const tweets = await scrapeTwitter();
      scraped.push(...tweets);
    }

    if (source === "web" || source === "all") {
      await ctx.api.editMessageText(
        chatId,
        status.message_id,
        `Scraping websites...${scraped.length > 0 ? ` (${scraped.length} items so far)` : ""}`
      );
      const articles = await scrapeWebsites();
      scraped.push(...articles);
    }

    if (source === "substack" || source === "all") {
      await ctx.api.editMessageText(
        chatId,
        status.message_id,
        `Fetching Substack RSS feeds...${scraped.length > 0 ? ` (${scraped.length} items so far)` : ""}`
      );
      const articles = await scrapeSubstacks();
      scraped.push(...articles);
    }

    scraped = deduplicate(scraped).slice(0, limit);

    if (scraped.length === 0) {
      await ctx.api.editMessageText(
        chatId,
        status.message_id,
        "No content found. Sources might be down or blocked."
      );
      return;
    }

    await ctx.api.editMessageText(
      chatId,
      status.message_id,
      `Found ${scraped.length} items. Generating Instagram posts with AI...`
    );

    const posts: InstagramPost[] = [];
    for (let i = 0; i < scraped.length; i++) {
      const item = scraped[i];
      try {
        await ctx.api.editMessageText(
          chatId,
          status.message_id,
          `Generating post ${i + 1}/${scraped.length}...`
        );
        const post = await generateInstagramPost(item);
        posts.push(post);
      } catch (err) {
        console.error(`Failed: ${item.source}`, (err as Error).message);
      }
    }

    await ctx.api.deleteMessage(chatId, status.message_id);

    if (posts.length === 0) {
      await ctx.reply("Failed to generate any posts. Check LLM API key.");
      return;
    }

    for (let i = 0; i < posts.length; i++) {
      const formatted = formatPostForTelegram(posts[i], i, posts.length);
      await ctx.reply(formatted, { parse_mode: "HTML" });

      const copyable = formatCaptionCopyable(posts[i]);
      await ctx.reply(copyable);
    }

    await ctx.reply(`Done! Generated ${posts.length} posts from ${scraped.length} scraped items.`);
  } catch (err) {
    console.error("Scrape error:", err);
    await ctx.reply(`Error: ${(err as Error).message}`);
  } finally {
    activeSessions.delete(chatId);
  }
}

async function handleBriefing(ctx: Context) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  if (activeSessions.has(chatId)) {
    await ctx.reply("A scrape is already running. Please wait for it to finish.");
    return;
  }

  activeSessions.add(chatId);

  try {
    const status = await ctx.reply("Generating daily briefing... Scraping all sources.");

    const scraped = await scrapeAll(30);

    if (scraped.length === 0) {
      await ctx.api.editMessageText(chatId, status.message_id, "No content found. Sources might be down.");
      return;
    }

    await ctx.api.editMessageText(
      chatId,
      status.message_id,
      `Found ${scraped.length} items. Generating briefing with AI...`
    );

    const briefing = await generateDailyBriefing(scraped);
    await ctx.api.deleteMessage(chatId, status.message_id);

    const formatted = formatBriefingForTelegram(briefing);

    if (formatted.length <= 4096) {
      await ctx.reply(formatted, { parse_mode: "HTML" });
    } else {
      const parts = splitTelegramMessage(formatted);
      for (const part of parts) {
        await ctx.reply(part, { parse_mode: "HTML" });
      }
    }
  } catch (err) {
    console.error("Briefing error:", err);
    await ctx.reply(`Error: ${(err as Error).message}`);
  } finally {
    activeSessions.delete(chatId);
  }
}

function splitTelegramMessage(text: string, maxLen = 4096): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    let cut = remaining.lastIndexOf("\n", maxLen);
    if (cut <= 0) cut = maxLen;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return parts;
}

export async function sendBriefingToSubscribers(): Promise<void> {
  if (subscribers.size === 0) {
    console.log("No subscribers to send briefing to.");
    return;
  }

  console.log(`Sending briefing to ${subscribers.size} subscriber(s)...`);

  const scraped = await scrapeAll(30);
  if (scraped.length === 0) {
    console.log("No content scraped. Skipping briefing send.");
    return;
  }

  const briefing = await generateDailyBriefing(scraped);
  const formatted = formatBriefingForTelegram(briefing);
  const parts = splitTelegramMessage(formatted);

  for (const chatId of subscribers) {
    try {
      for (const part of parts) {
        await bot.api.sendMessage(chatId, part, { parse_mode: "HTML" });
      }
      console.log(`  Sent to ${chatId}`);
    } catch (err) {
      console.error(`  Failed to send to ${chatId}:`, (err as Error).message);
      if ((err as { error_code?: number }).error_code === 403) {
        subscribers.delete(chatId);
        saveSubscribers(subscribers);
        console.log(`  Removed ${chatId} (blocked bot)`);
      }
    }
  }

  await closeBrowser();
  console.log("Briefing sent to all subscribers.");
}

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "<b>StockUs News Scraper Bot</b>",
      "",
      "Scrape financial news and generate @stockus.id Instagram posts.",
      "",
      "<b>Commands:</b>",
      "/news — Scrape all sources (Twitter + Web + Substack)",
      "/twitter — Scrape Twitter accounts only",
      "/web — Scrape websites only",
      "/substack — Scrape Substack RSS only",
      "/briefing — Get daily market briefing",
      "/subscribe — Get daily briefing automatically",
      "/unsubscribe — Stop daily briefing",
      "/help — Show all commands",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    [
      "<b>Commands:</b>",
      "",
      "<b>Instagram Posts:</b>",
      "/news — Scrape all sources, generate up to 10 posts",
      "/twitter — Twitter only",
      "/web — Websites only",
      "/substack — Substack RSS only",
      "",
      "<b>With limits:</b>",
      "/news3 — All sources, max 3 posts",
      "/twitter5 — Twitter, max 5 posts",
      "/web2 — Web, max 2 posts",
      "/substack3 — Substack, max 3 posts",
      "",
      "<b>Daily Briefing:</b>",
      "/briefing — Generate market briefing now",
      "/subscribe — Get daily briefing automatically",
      "/unsubscribe — Stop daily briefing",
      "",
      "Each post includes: headline, caption, hashtags, and carousel slide texts.",
    ].join("\n"),
    { parse_mode: "HTML" }
  );
});

bot.command("subscribe", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  if (subscribers.has(chatId)) {
    await ctx.reply("You're already subscribed to daily briefings.");
    return;
  }

  subscribers.add(chatId);
  saveSubscribers(subscribers);
  await ctx.reply(
    "Subscribed! You'll receive the daily market briefing automatically.\n\nUse /unsubscribe to stop."
  );
});

bot.command("unsubscribe", async (ctx) => {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  if (!subscribers.has(chatId)) {
    await ctx.reply("You're not subscribed.");
    return;
  }

  subscribers.delete(chatId);
  saveSubscribers(subscribers);
  await ctx.reply("Unsubscribed. You won't receive daily briefings anymore.");
});

bot.command("briefing", async (ctx) => {
  await handleBriefing(ctx);
});

bot.hears(/^\/news(\d+)?$/, async (ctx) => {
  const limit = parseInt(ctx.match[1] ?? "10", 10);
  await handleScrape(ctx, "all", limit);
});

bot.hears(/^\/twitter(\d+)?$/, async (ctx) => {
  const limit = parseInt(ctx.match[1] ?? "10", 10);
  await handleScrape(ctx, "twitter", limit);
});

bot.hears(/^\/web(\d+)?$/, async (ctx) => {
  const limit = parseInt(ctx.match[1] ?? "10", 10);
  await handleScrape(ctx, "web", limit);
});

bot.hears(/^\/substack(\d+)?$/, async (ctx) => {
  const limit = parseInt(ctx.match[1] ?? "10", 10);
  await handleScrape(ctx, "substack", limit);
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await closeBrowser();
  process.exit(0);
});

// If run with --send-briefing flag, send to all subscribers and exit
if (process.argv.includes("--send-briefing")) {
  sendBriefingToSubscribers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to send briefing:", err);
      process.exit(1);
    });
} else {
  console.log("StockUs News Scraper Bot starting...");

  await bot.api.setMyCommands([
    { command: "news", description: "Scrape all sources (Twitter + Web + Substack)" },
    { command: "twitter", description: "Scrape Twitter accounts only" },
    { command: "web", description: "Scrape websites only" },
    { command: "substack", description: "Scrape Substack RSS feeds only" },
    { command: "briefing", description: "Get daily market briefing" },
    { command: "subscribe", description: "Get daily briefing automatically" },
    { command: "unsubscribe", description: "Stop daily briefing" },
    { command: "help", description: "Show all commands" },
  ]);

  bot.start();
  console.log("Bot is running. Press Ctrl+C to stop.");

  // Daily briefing at 07:00 WIB (00:00 UTC)
  cron.schedule("0 0 * * *", () => {
    console.log(`[Cron] Sending daily briefing — ${new Date().toISOString()}`);
    sendBriefingToSubscribers().catch((err) => {
      console.error("[Cron] Briefing failed:", (err as Error).message);
    });
  });
  console.log("Daily briefing scheduled at 07:00 WIB (00:00 UTC).");
}
