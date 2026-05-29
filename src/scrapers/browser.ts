import { launch } from "cloakbrowser";
import type { Browser } from "playwright-core";

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await launch({ humanize: true, headless: true }) as unknown as Browser;
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
