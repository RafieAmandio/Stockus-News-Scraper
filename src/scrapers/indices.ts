export interface IndexData {
  symbol: string;
  price: number;
  changePercent: number;
}

const TICKERS: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  "^DJI": "Dow Jones",
};

async function fetchTicker(ticker: string): Promise<IndexData | null> {
  const hosts = [
    "query1.finance.yahoo.com",
    "query2.finance.yahoo.com",
  ];

  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;

      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              chartPreviousClose?: number;
              previousClose?: number;
            };
          }>;
        };
      };

      const meta = json.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      const prev = meta?.chartPreviousClose ?? meta?.previousClose;
      if (!price || !prev) continue;
      const changePercent = ((price - prev) / prev) * 100;

      return {
        symbol: TICKERS[ticker] ?? ticker,
        price,
        changePercent,
      };
    } catch {
      continue;
    }
  }

  console.error(`  Failed to fetch ${TICKERS[ticker] ?? ticker}`);
  return null;
}

export async function fetchUSIndices(): Promise<IndexData[]> {
  const results = await Promise.allSettled(
    Object.keys(TICKERS).map(fetchTicker)
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<IndexData | null> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value)
    .filter((v): v is IndexData => v !== null);
}

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatIndicesLine(indices: IndexData[]): string {
  if (indices.length === 0) return "Data indeks belum tersedia";

  return indices
    .map((i) => {
      const sign = i.changePercent >= 0 ? "+" : "";
      return `${i.symbol}: ${fmt.format(i.price)} (${sign}${i.changePercent.toFixed(2)}%)`;
    })
    .join("\n");
}
