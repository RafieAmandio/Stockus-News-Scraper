import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { InstagramPost, DailyBriefing } from "../types.ts";

export function printPost(post: InstagramPost, index: number): void {
  const divider = "=".repeat(60);
  console.log(`\n${divider}`);
  console.log(`POST #${index + 1} | Source: ${post.source}`);
  if (post.originalUrl) console.log(`URL: ${post.originalUrl}`);
  console.log(divider);

  console.log(`\nHEADLINE:\n${post.headline}`);

  console.log(`\nCAPTION:\n${post.caption}`);

  console.log(`\nHASHTAGS:\n${post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}`);

  if (post.slideTexts.length > 0) {
    console.log(`\nCARIOUSEL SLIDES:`);
    post.slideTexts.forEach((text, i) => {
      console.log(`  Slide ${i + 1}: ${text}`);
    });
  }

  console.log("");
}

export function savePosts(posts: InstagramPost[], dir: string): void {
  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  posts.forEach((post, i) => {
    const filename = `${timestamp}_post-${i + 1}.md`;
    const hashtags = post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");

    const content = `# ${post.headline}

**Source:** ${post.source}${post.originalUrl ? `\n**URL:** ${post.originalUrl}` : ""}

---

## Caption

${post.caption}

---

## Hashtags

${hashtags}

---

## Carousel Slides

${post.slideTexts.map((t, j) => `${j + 1}. ${t}`).join("\n")}
`;

    writeFileSync(join(dir, filename), content);
  });

  console.log(`Saved ${posts.length} posts to ${dir}/`);
}

export function printBriefing(briefing: DailyBriefing): void {
  const divider = "=".repeat(60);
  console.log(`\n${divider}`);
  console.log(briefing.header);
  console.log(divider);

  if (briefing.pergerakan_indeks) {
    console.log(`\n📊 PERGERAKAN INDEKS:\n`);
    console.log(briefing.pergerakan_indeks);
  }

  console.log(`\n🔥 SENTIMEN MARKET:\n`);
  console.log(briefing.sentimen_market);

  console.log(`\n🏢 BERITA COMPANY:\n`);
  briefing.berita_company.forEach((b) => {
    console.log(`• ${b}\n`);
  });

  console.log(`📈 TAKEAWAY:\n`);
  console.log(briefing.takeaway);
  console.log("");
}

export function saveBriefing(briefing: DailyBriefing, dir: string): void {
  mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${timestamp}_briefing.md`;

  const bullets = briefing.berita_company.map((b) => `• ${b}`).join("\n\n");
  const indexSection = briefing.pergerakan_indeks
    ? `## 📊 Pergerakan Indeks\n\n${briefing.pergerakan_indeks}\n\n`
    : "";

  const content = `# ${briefing.header}

${indexSection}## 🔥 Sentimen Market

${briefing.sentimen_market}

## 🏢 Berita Company

${bullets}

## 📈 Takeaway

${briefing.takeaway}

---
Generated: ${briefing.generatedAt}
`;

  writeFileSync(join(dir, filename), content);
  console.log(`Saved briefing to ${dir}/${filename}`);
}
