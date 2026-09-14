"use client";

import { useEffect, useState } from "react";

import config from "@/config/feeds.json";

interface ItemSource {
  name: string;
  url: string;
}

interface SpaceItem {
  id: number;
  title: string;
  agency: string;
  mission: string | null;
  publishedAt: string;
  summary: string;
  images?: string[];
  /** Consolidated stories carry sources[]; raw feed items carry url+source. */
  sources?: ItemSource[];
  url?: string;
  source?: string;
}

function itemSources(item: SpaceItem): ItemSource[] {
  if (item.sources && item.sources.length > 0) return item.sources;
  if (item.url) return [{ name: item.source ?? "source", url: item.url }];
  return [];
}

interface SpaceFile {
  generatedAt: string;
  failedFeeds: string[];
  items: SpaceItem[];
}

const AGENCIES = config.agencies as Record<string, { label: string; color: string }>;
const GENERAL = "Agency News";

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return "today";
  const hours = Math.round(mins / 60);
  if (hours < 24) return "today";
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "last week" : `${weeks} weeks ago`;
}

/** agency -> mission -> items, preserving config's agency order and each
 * group's newest-first ordering (items arrive sorted newest first). */
function groupItems(items: SpaceItem[]) {
  const byAgency = new Map<string, Map<string, SpaceItem[]>>();
  for (const item of items) {
    const agency = AGENCIES[item.agency] ? item.agency : "nasa";
    if (!byAgency.has(agency)) byAgency.set(agency, new Map());
    const missions = byAgency.get(agency)!;
    const mission = item.mission || GENERAL;
    if (!missions.has(mission)) missions.set(mission, []);
    missions.get(mission)!.push(item);
  }
  return Object.keys(AGENCIES)
    .filter((a) => byAgency.has(a))
    .map((a) => ({
      agency: a,
      // missions sorted by their newest item; the general bucket always last
      missions: [...byAgency.get(a)!.entries()].sort((x, y) => {
        if (x[0] === GENERAL) return 1;
        if (y[0] === GENERAL) return -1;
        return y[1][0].publishedAt.localeCompare(x[1][0].publishedAt);
      }),
    }));
}

export default function Home() {
  const [data, setData] = useState<SpaceFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/space.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          Space<span className="text-neutral-500">.</span>
        </h1>
        {data && (
          <p className="text-xs text-neutral-500">updated {relativeTime(data.generatedAt)}</p>
        )}
      </header>

      {loading && (
        <p className="animate-pulse py-16 text-center text-sm text-neutral-500">Loading…</p>
      )}

      {!loading && !data && (
        <div className="rounded-lg border border-dashed border-white/15 p-8 text-center text-sm text-neutral-400">
          <p className="font-medium text-neutral-300">No data yet</p>
          <p className="mt-2">
            Run <code className="rounded bg-white/10 px-1.5 py-0.5">npm run fetch-space</code> to
            populate <code className="rounded bg-white/10 px-1.5 py-0.5">public/data/</code>.
          </p>
        </div>
      )}

      {data &&
        groupItems(data.items).map(({ agency, missions }) => (
          <section key={agency} className="mt-10 first:mt-0">
            <h2 className="flex items-center gap-2.5 border-b border-white/10 pb-2 text-lg font-semibold tracking-tight">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: AGENCIES[agency].color }}
              />
              {AGENCIES[agency].label}
            </h2>
            {missions.map(([mission, items]) => (
              <div key={mission} className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                  {mission}
                </h3>
                <ol>
                  {items.map((item) => {
                    const sources = itemSources(item);
                    const images = item.images ?? [];
                    return (
                      <li key={item.id}>
                        <article className="group py-3">
                          <a
                            href={sources[0]?.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[16px] font-medium leading-snug text-neutral-100 underline-offset-2 hover:underline"
                          >
                            {item.title}
                          </a>
                          <span className="ml-2 whitespace-nowrap text-xs text-neutral-500">
                            <time dateTime={item.publishedAt}>{relativeTime(item.publishedAt)}</time>
                          </span>
                          {item.summary && (
                            <p className="mt-1 max-w-prose text-sm leading-relaxed text-neutral-400">
                              {item.summary}
                            </p>
                          )}
                          {images.length > 0 && (
                            <div className="mt-2 flex gap-2">
                              {images.map((src) => (
                                <a
                                  key={src}
                                  href={sources[0]?.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block overflow-hidden rounded-md border border-white/10"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt=""
                                    loading="lazy"
                                    className="h-24 w-36 object-cover transition-transform group-hover:scale-[1.02] sm:h-28 sm:w-44"
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          {sources.length > 0 && (
                            <p className="mt-1.5 text-xs text-neutral-500">
                              {sources.map((s, j) => (
                                <span key={s.url}>
                                  {j > 0 && <span aria-hidden> · </span>}
                                  <a
                                    href={s.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline-offset-2 hover:text-neutral-300 hover:underline"
                                  >
                                    {s.name}
                                  </a>
                                </span>
                              ))}
                            </p>
                          )}
                        </article>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        ))}

      <footer className="mt-14 border-t border-white/10 py-6 text-center text-xs text-neutral-500">
        <p>
          <a
            href="https://vincentramdhanie.com"
            className="text-neutral-400 underline-offset-2 hover:text-white hover:underline"
          >
            ← Back to vincentramdhanie.com
          </a>
        </p>
        <p className="mt-2">
          Weekly digest of mission news and images from the world&apos;s space agencies. Headlines
          and images link to their original sources.
        </p>
      </footer>
    </div>
  );
}
