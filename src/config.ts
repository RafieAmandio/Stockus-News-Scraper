import "dotenv/config";

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "",
  LLM_API_KEY: required("LLM_API_KEY"),
  LLM_MODEL: process.env.LLM_MODEL ?? "kimi-k2.6",
  LLM_BASE_URL: process.env.LLM_BASE_URL ?? "https://api.moonshot.ai/v1",
} as const;
