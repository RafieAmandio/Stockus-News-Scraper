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
  sentimen_market: string;
  berita_company: string[];
  takeaway: string;
  sources: string[];
  generatedAt: string;
}
