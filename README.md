# Space

[![Deploy](https://img.shields.io/github/actions/workflow/status/vramdhanie/space/deploy.yml?branch=main&label=deploy&logo=github)](https://github.com/vramdhanie/space/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/github/license/vramdhanie/space?color=green)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

A weekly digest of what the world's space agencies are up to — mission news,
findings, and new images from NASA, ESA, JAXA, ISRO, CNSA, and the Vera C.
Rubin Observatory, sorted by agency and mission. Fully static, no server, no
database, no API keys.

Live at [space.vincentramdhanie.com](https://space.vincentramdhanie.com).

## How it works

- A **local Claude scheduled task** (weekly) runs `scripts/fetch-space.mjs`
  to pull the agency RSS/Atom feeds listed in
  [`src/config/feeds.json`](src/config/feeds.json) — official feeds where
  they exist (NASA, ESA, JAXA, ESA/Webb, ESA/Hubble, JPL Photojournal) and
  targeted Google News queries for missions without one (Rubin, Roman,
  Parker Solar Probe, Europa Clipper, JUICE, ISRO). The task then edits the
  result: it classifies items into missions, consolidates duplicates,
  writes a short factual abstract for each story, keeps the new images, and
  drops administrative noise. The finished `public/data/space.json` is
  force-pushed to a `data` branch (always one commit ahead of `main`).
- **Deploy** (`deploy.yml`) fires on pushes to `main`; a bridge workflow
  (`redeploy-on-data.yml`) re-dispatches it when the `data` branch is
  pushed. It checks out `main`, overlays `public/data` from the `data`
  branch, builds the static export, and publishes to GitHub Pages.

The browser only reads the static JSON. Headlines and images link out to
their original sources — nothing is republished.

## Editing the feed list

Add or remove entries in [`src/config/feeds.json`](src/config/feeds.json).
Each feed carries an `agency` id (must exist in the `agencies` map) and an
optional `mission` label used to pre-group its items; items from agency-wide
feeds are classified into missions by the weekly task instead.

## Local development

```bash
npm install
npm run fetch-space   # writes public/data/space.json
npm run dev
```

## License

[MIT](LICENSE)
