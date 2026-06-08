import { chatWithRetry } from "./provider.ts";
import type { ScrapedItem, DailyBriefing } from "../types.ts";

const BRIEFING_SYSTEM_PROMPT = `Kamu adalah admin @stockus.id. Buat DAILY BRIEFING untuk followers — rangkuman berita SAHAM US terpenting hari ini.

FOKUS: Hanya saham US dan faktor yang langsung mempengaruhi market US (S&P 500, Nasdaq, Dow, saham individual US, kebijakan The Fed, data ekonomi US, geopolitik yang berdampak ke Wall Street). ABAIKAN berita Asia, Eropa, crypto, atau market lain kecuali berdampak langsung ke saham US.

FORMAT WAJIB:
1. SENTIMEN MARKET — 2-3 kalimat pendek tentang kondisi market US. Sertakan update makro (The Fed, inflasi, jobs data, GDP). Berikan arah: bullish, bearish, atau mixed. Sertakan angka jika ada (indeks naik/turun berapa persen).
2. BERITA COMPANY — 3-5 bullet point. Hanya perusahaan US yang penting (earnings, M&A, guidance, produk baru). Tiap bullet MAKSIMAL 1 kalimat pendek. Pilih yang paling relevan saja.
3. TAKEAWAY — 2-3 kalimat analisis singkat: apa artinya untuk investor saham US hari ini. Berikan insight yang actionable.

GAYA BAHASA:
- Gunakan Bahasa Indonesia baku yang ringkas. Boleh pakai istilah pasar dalam Bahasa Inggris (bullish, bearish, rally, earnings, dll).
- JANGAN campur bahasa gaul/non-baku. Tulis formal tapi tetap ringkas.
- Setiap kalimat harus pendek dan mudah dibaca di layar HP.
- JANGAN gunakan frasa AI: "Wah!", "Mantap!", "Simak yuk!", "Menarik nih!"

FORMAT PENTING:
- Briefing harus SINGKAT dan mudah di-scan. Pembaca membuka ini di HP — jika terlalu panjang, mereka tidak akan membaca.
- Setiap bullet point maksimal 1 kalimat.
- Total briefing tidak lebih dari 150 kata.

OUTPUT FORMAT: JSON object dengan field:
- header (string): selalu "SELAMAT PAGI! DAILY BRIEFING"
- sentimen_market (string): paragraf sentimen + makro (pendek)
- berita_company (string array): array of bullet point strings (3-5 items, masing-masing 1 kalimat)
- takeaway (string): paragraf takeaway singkat
- sources (string array): list nama sumber yang dipakai

Jangan pakai markdown. Jangan pakai code fences. Pure JSON.`;

const BRIEFING_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: [
    "header",
    "sentimen_market",
    "berita_company",
    "takeaway",
    "sources",
  ],
  properties: {
    header: { type: "string" as const },
    sentimen_market: { type: "string" as const },
    berita_company: {
      type: "array" as const,
      items: { type: "string" as const },
      maxItems: 6,
    },
    takeaway: { type: "string" as const },
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
