#!/usr/bin/env node
/**
 * Fetches the space-agency RSS/Atom feeds listed in src/config/feeds.json and
 * writes a single normalized public/data/space.json. Runs from the weekly
 * scheduled refresh task (or locally) — never in the browser, where CORS
 * would block the feeds anyway. Entirely keyless.
 *
 * Design goals:
 *  - mission-focused: each item carries an agency and (where the feed knows
 *    it) a mission label; the weekly summarize step classifies the rest
 *  - images matter here: media:content / media:thumbnail / enclosure / first
 *    <img> in the description are all captured
 *  - tolerant of individual feed failures (partial data beats no data)
 *  - no npm dependencies (a small forgiving parser for RSS 2.0, RDF and Atom)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "public", "data");

const MAX_AGE_HOURS = 14 * 24;  // two weeks — weekly cadence plus slack
const MAX_PER_FEED = 20;        // cap each feed's contribution
const MAX_TOTAL = 250;          // overall cap after sorting
const MAX_IMAGES = 3;           // per item
const FETCH_TIMEOUT_MS = 20000;

const decodeEntities = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripHtml = (s) => decodeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Trim to max chars at a word boundary, with an ellipsis if shortened. */
function clip(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd() + "…";
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : "";
}

/** Collect image URLs from the media extensions and inline markup of a feed item. */
function extractImages(block) {
  const urls = [];
  const push = (u) => {
    if (!u) return;
    const url = decodeEntities(u.trim());
    // Feeds sometimes attach tracking pixels, icons, or video posters at odd sizes.
    if (!/^https?:\/\//i.test(url)) return;
    if (/\.(mp4|webm|mov|mp3|pdf)(\?|$)/i.test(url)) return;
    if (!urls.includes(url)) urls.push(url);
  };
  for (const m of block.matchAll(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["'][^>]*>/gi)) {
    // media:content can also be video; only keep declared or apparent images
    const attrs = m[0];
    if (/medium=["']video["']|type=["']video/i.test(attrs)) continue;
    push(m[1]);
  }
  for (const m of block.matchAll(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/gi)) {
    if (!/type=["']image\//i.test(m[0]) && !/\.(jpe?g|png|gif|webp)(\?|$)/i.test(m[1])) continue;
    push(m[1]);
  }
  const desc = tag(block, "description") || tag(block, "summary") || tag(block, "content:encoded") || tag(block, "content");
  for (const m of decodeEntities(desc).matchAll(/<img[^>]*src=["']([^"']+)["']/gi)) push(m[1]);
  return urls.slice(0, MAX_IMAGES);
}

/** Parse RSS 2.0 <item>, RDF <item> and Atom <entry> blocks from a feed body. */
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const title = stripHtml(tag(block, "title"));
    // Atom links are attributes; RSS links are element text
    let link = stripHtml(tag(block, "link"));
    if (!link) {
      const m = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) ??
        block.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = m ? decodeEntities(m[1]) : "";
    }
    const dateRaw =
      tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    const summaryRaw = tag(block, "description") || tag(block, "summary") || tag(block, "content");
    const source = stripHtml(tag(block, "source"));
    if (!title || !link) continue;
    const date = new Date(decodeEntities(dateRaw));
    items.push({
      title,
      url: link,
      publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      summary: clip(stripHtml(summaryRaw), 320),
      images: extractImages(block),
      itemSource: source || null,
    });
  }
  return items;
}

/** Google News wraps everything: titles end " - Source", links redirect,
 * and summaries are markup soup. Clean all three. */
function cleanGoogleNews(item) {
  const m = item.title.match(/^(.*)\s-\s([^-]+)$/);
  if (m) {
    item.title = m[1].trim();
    item.itemSource = item.itemSource || m[2].trim();
  }
  item.summary = ""; // Google News summaries just restate the title
  item.images = [];  // and their images are favicons
  return item;
}

const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "space.vincentramdhanie.com aggregator (personal use)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  let items = parseFeed(xml);
  if (/news\.google\.com/.test(feed.url)) items = items.map(cleanGoogleNews);
  return items.slice(0, MAX_PER_FEED).map((it) => ({
    ...it,
    source: it.itemSource || feed.name,
    agency: feed.agency,
    mission: feed.mission,
  }));
}

async function main() {
  const config = JSON.parse(await readFile(path.join(ROOT, "src", "config", "feeds.json"), "utf8"));
  await mkdir(DATA_DIR, { recursive: true });

  const cutoff = Date.now() - MAX_AGE_HOURS * 3600 * 1000;
  const all = [];
  const errors = [];

  const results = await Promise.allSettled(config.feeds.map((f) => fetchFeed(f)));
  results.forEach((r, i) => {
    const feed = config.feeds[i];
    if (r.status === "fulfilled") {
      console.log(`ok    ${feed.name}: ${r.value.length} items`);
      all.push(...r.value);
    } else {
      console.error(`FAIL  ${feed.name}: ${r.reason.message}`);
      errors.push(feed.name);
    }
  });

  const seenUrl = new Set();
  const seenTitle = new Set();
  const items = all
    .filter((it) => it.publishedAt && new Date(it.publishedAt).getTime() >= cutoff)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .filter((it) => {
      const t = normTitle(it.title);
      if (seenUrl.has(it.url) || seenTitle.has(t)) return false;
      seenUrl.add(it.url);
      seenTitle.add(t);
      return true;
    })
    .slice(0, MAX_TOTAL)
    .map((it, i) => ({ id: i, ...it, itemSource: undefined }));

  await writeFile(
    path.join(DATA_DIR, "space.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), failedFeeds: errors, items }, null, 1),
  );
  console.log(`\nwrote public/data/space.json: ${items.length} items, ${errors.length} failed feed(s)`);
  // Only die if literally everything failed — partial data beats none.
  if (items.length === 0) process.exit(1);
}

main();
