import type { InstagramPost, DailyBriefing, StockInsight } from "../types.ts";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatPostForTelegram(post: InstagramPost, index: number, total: number): string {
  const hashtags = post.hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  const slides = post.slideTexts
    .map((t, i) => `  ${i + 1}. ${escapeHtml(t)}`)
    .join("\n");

  return [
    `<b>POST ${index + 1}/${total}</b>`,
    `<i>Source: ${escapeHtml(post.source)}</i>`,
    post.originalUrl ? `<a href="${post.originalUrl}">Original</a>` : "",
    "",
    `<b>${escapeHtml(post.headline)}</b>`,
    "",
    `<blockquote>${escapeHtml(post.caption)}</blockquote>`,
    "",
    `<b>Carousel Slides:</b>`,
    slides,
    "",
    escapeHtml(hashtags),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatCaptionCopyable(post: InstagramPost): string {
  const hashtags = post.hashtags
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  return `${post.caption}\n\n${hashtags}`;
}

export function formatBriefingForTelegram(briefing: DailyBriefing): string {
  const bullets = briefing.berita_company
    .map((b) => `• ${escapeHtml(b)}`)
    .join("\n\n");

  const parts = [
    `<b>${escapeHtml(briefing.header)}</b>`,
    "",
    "",
  ];

  if (briefing.pergerakan_indeks && briefing.pergerakan_indeks !== "Data indeks belum tersedia") {
    parts.push(
      `📊 <b>PERGERAKAN INDEKS</b>`,
      "",
      escapeHtml(briefing.pergerakan_indeks),
      "",
      "",
    );
  }

  parts.push(
    `🔥 <b>SENTIMEN MARKET</b>`,
    "",
    escapeHtml(briefing.sentimen_market),
    "",
    "",
    `🏢 <b>BERITA COMPANY</b>`,
    "",
    bullets,
    "",
    "",
    `📈 <b>TAKEAWAY</b>`,
    "",
    escapeHtml(briefing.takeaway),
  );

  return parts.join("\n");
}

export function formatInsightsForTelegram(insight: StockInsight): string {
  const items = insight.insights.map((item) => {
    const tickerSuffix = item.ticker ? ` ($${escapeHtml(item.ticker)})` : "";
    return [
      `📌 <b>${escapeHtml(item.judul)}</b>${tickerSuffix}`,
      "",
      escapeHtml(item.ringkasan),
    ].join("\n");
  });

  return [
    `<b>${escapeHtml(insight.header)}</b>`,
    "",
    items.join("\n\n\n"),
  ].join("\n");
}
