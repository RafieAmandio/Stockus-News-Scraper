import { chatWithRetry } from "./provider.ts";
import type { ScrapedItem, StockInsight } from "../types.ts";

const INSIGHTS_SYSTEM_PROMPT = `Kamu adalah analis saham @stockus.id. Tugas kamu adalah membuat STOCK INSIGHTS — rangkuman analisis saham dari artikel-artikel yang diberikan.

ATURAN:
1. Baca semua artikel, lalu pilih 3-5 insight paling menarik dan relevan untuk investor saham US.
2. PARAFRASE — jangan copy-paste dari artikel. Tulis ulang dengan gaya kamu sendiri.
3. Setiap insight harus terasa seperti analisis yang dikurasi, bukan ringkasan artikel.
4. Fokus pada: thesis investasi, analisis valuasi, potensi upside/downside, katalisis, atau perubahan fundamental.
5. Jika ada ticker saham US yang relevan, sertakan.
6. ABAIKAN topik non-US (Asia, Eropa, crypto) kecuali berdampak langsung ke saham US.

FORMAT OUTPUT: JSON object dengan field:
- insights (array of objects):
  - judul (string): judul pendek insight, max 60 karakter
  - ringkasan (string): 2-3 kalimat parafrase analisis. Harus actionable dan informatif.
  - ticker (string, optional): ticker saham US jika relevan (misal "AAPL", "NVDA")

GAYA BAHASA:
- Bahasa Indonesia baku, ringkas, formal tapi mudah dibaca.
- Boleh pakai istilah pasar dalam Bahasa Inggris.
- JANGAN gunakan frasa AI: "Wah!", "Mantap!", "Simak yuk!"
- Setiap kalimat harus pendek dan mudah dibaca di layar HP.

Jangan pakai markdown. Jangan pakai code fences. Pure JSON.`;

const INSIGHTS_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["insights"],
  properties: {
    insights: {
      type: "array" as const,
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["judul", "ringkasan"],
        properties: {
          judul: { type: "string" as const },
          ringkasan: { type: "string" as const },
          ticker: { type: "string" as const },
        },
      },
      minItems: 1,
      maxItems: 5,
    },
  },
};

export async function generateStockInsights(
  substackItems: ScrapedItem[],
  timeLabel: "SIANG" | "SORE"
): Promise<StockInsight> {
  const newsBlock = substackItems
    .map((item, i) => {
      const parts = [`[${i + 1}] SOURCE: ${item.source}`];
      if (item.title) parts.push(`JUDUL: ${item.title}`);
      if (item.author) parts.push(`DARI: ${item.author}`);
      if (item.date) parts.push(`TANGGAL: ${item.date}`);
      parts.push(`KONTEN: ${item.content.slice(0, 2000)}`);
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const userMsg = `Buat Stock Insights dari ${substackItems.length} artikel ini:\n\n${newsBlock}\n\nReturn JSON.`;

  const raw = await chatWithRetry({
    system: INSIGHTS_SYSTEM_PROMPT,
    user: userMsg,
    jsonSchema: {
      name: "stock_insights",
      strict: true,
      schema: INSIGHTS_SCHEMA,
    },
  });

  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned) as { insights: StockInsight["insights"] };

  return {
    header: `STOCK INSIGHTS ${timeLabel}`,
    insights: parsed.insights,
    generatedAt: new Date().toISOString(),
  };
}
