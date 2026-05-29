import { chatWithRetry } from "./provider.ts";
import type { ScrapedItem, DailyBriefing } from "../types.ts";

const BRIEFING_SYSTEM_PROMPT = `Lo adalah admin @stockus.id. Lo bikin DAILY BRIEFING pagi buat followers — rangkuman berita market terpenting hari ini.

FORMAT WAJIB:
1. SENTIMEN MARKET — 2-3 kalimat soal overall mood market (crypto, US stocks, Asia). Kasih arah: bullish, bearish, atau mixed. Sertakan data kalau ada (index naik/turun berapa %).
2. BERITA GLOBAL — 5-8 bullet point berita paling penting. Tiap bullet 1-2 kalimat. Prioritaskan yang impact ke portfolio investor Indo.
3. IMPAK — 2-3 kalimat analisis lo: apa artinya buat investor Indo hari ini. Kasih actionable insight, bukan generic "hati-hati ya".

GAYA BAHASA:
- Bahasa Indo sehari-hari campur English (sama kayak nulis WA ke temen trader).
- Singkat, padat, gak bertele-tele. Ini briefing, bukan artikel.
- JANGAN pake emoji lebih dari 3-4 total.
- JANGAN pake frasa AI: "Wah!", "Mantap!", "Simak yuk!", "Menarik nih!"
- Nulis kayak trader yang beneran ngerti, bukan kayak bot yang baca berita.

OUTPUT FORMAT: JSON object dengan field:
- header (string): selalu "SELAMAT PAGI! DAILY BRIEFING"
- sentimen_market (string): paragraf sentimen
- berita_global (string array): array of bullet point strings
- impak (string): paragraf analisis impact
- sources (string array): list nama sumber yang dipake

Jangan pake markdown. Jangan pake code fences. Pure JSON.`;

const BRIEFING_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "header",
    "sentimen_market",
    "berita_global",
    "impak",
    "sources",
  ],
  properties: {
    header: { type: "string" as const },
    sentimen_market: { type: "string" as const },
    berita_global: {
      type: "array" as const,
      items: { type: "string" as const },
      maxItems: 10,
    },
    impak: { type: "string" as const },
    sources: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
};

export async function generateDailyBriefing(
  items: ScrapedItem[]
): Promise<DailyBriefing> {
  const newsBlock = items
    .map((item, i) => {
      const parts = [`[${i + 1}] SOURCE: ${item.source}`];
      if (item.title) parts.push(`JUDUL: ${item.title}`);
      if (item.author) parts.push(`DARI: ${item.author}`);
      if (item.date) parts.push(`TANGGAL: ${item.date}`);
      parts.push(`KONTEN: ${item.content.slice(0, 1500)}`);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const userMsg = `Bikin Daily Briefing dari ${items.length} berita ini:\n\n${newsBlock}\n\nReturn JSON.`;

  const raw = await chatWithRetry({
    system: BRIEFING_SYSTEM_PROMPT,
    user: userMsg,
    jsonSchema: {
      name: "daily_briefing",
      strict: true,
      schema: BRIEFING_SCHEMA,
    },
  });

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as DailyBriefing;

  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
  };
}
