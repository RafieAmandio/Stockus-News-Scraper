export interface ScrapedItem {
  source: string;
  title?: string;
  content: string;
  url?: string;
  date?: string;
  author?: string;
}

export interface InstagramPost {
  headline: string;
  caption: string;
  hashtags: string[];
  slideTexts: string[];
  source: string;
  originalUrl?: string;
}

export interface SubstackSource {
  name: string;
  feedUrl: string;
}

export interface DailyBriefing {
  header: string;
  pergerakan_indeks: string;
  sentimen_market: string;
  berita_company: string[];
  takeaway: string;
  generatedAt: string;
}

export interface StockInsightItem {
  judul: string;
  ringkasan: string;
  ticker?: string;
}

export interface StockInsight {
  header: string;
  insights: StockInsightItem[];
  generatedAt: string;
}
