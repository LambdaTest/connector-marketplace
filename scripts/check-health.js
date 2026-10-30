#!/usr/bin/env node
'use strict';

// Checks every listing and writes health.json for the site.
// Usage: node scripts/check-health.js --out dist/site/health.json [--previous <file or https URL>] [--catalog dist/site/catalog.json]
//
// --previous carries history forward (last_ok, down_since). In CI it points at the
// live site's health.json, so no state is stored in the repo.
// --catalog removes listings that have failed checks for HIDE_AFTER_DAYS from the built
// catalog. Every listing is still checked, so a hidden one returns when it passes again.
// Always exits 0: a partner's outage must not block deploying the site.

const fs = require('node:fs');
const path = require('node:path');
const { validateFiles, listingFiles } = require('./lib/validate');
const { checkListings } = require('./lib/links');
const { buildHealth, withoutHidden, HIDE_AFTER_DAYS } = require('./lib/health');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function loadPrevious(src) {
  if (!src) return null;
  try {
    if (src.startsWith('https://')) {
      const res = await fetch(src, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      return await res.json();
    }
    return fs.existsSync(src) ? JSON.parse(fs.readFileSync(src, 'utf8')) : null;
  } catch {
    return null; // first deploy, or the old file is unreadable: start fresh
  }
}

async function main() {
  const out = arg('--out') || 'dist/site/health.json';
  const previous = await loadPrevious(arg('--previous'));
  const { listings, taxonomy } = validateFiles(listingFiles());
  const health = buildHealth(await checkListings(listings, taxonomy), previous);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(health, null, 2)}\n`);

  const catalogFile = arg('--catalog');
  if (catalogFile && health.counts.hidden) {
    const catalog = withoutHidden(JSON.parse(fs.readFileSync(catalogFile, 'utf8')), health);
    fs.writeFileSync(catalogFile, `${JSON.stringify(catalog)}\n`);
  }

  const lines = Object.values(health.listings).map((l) => {
    const icon = { healthy: '✔', degraded: '⚠', down: '✖' }[l.status];
    const since = l.down_since ? ` since ${l.down_since}${l.hidden ? ' (hidden)' : `, hidden on ${l.hide_on}`}` : '';
    const why = l.problems.map((p) => p.message).join('; ');
    return `${icon} ${l.id}  ${l.status}${since}${why ? `  ${why}` : ''}`;
  });
  console.log(lines.join('\n'));
  console.log(`\n${health.counts.healthy} healthy, ${health.counts.degraded} degraded, ${health.counts.down} down, ${health.counts.hidden} hidden (failing ${HIDE_AFTER_DAYS}+ days) → ${out}${previous ? ' (history carried forward)' : ''}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = Object.values(health.listings)
      .map((l) => `| \`${l.id}\` | ${l.status}${l.hidden ? ' (hidden)' : ''} | ${l.down_since || ''} | ${l.problems.map((p) => p.message).join('<br>')} |`)
      .join('\n');
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Listing health\n\n| listing | status | down since | problems |\n| --- | --- | --- | --- |\n${rows}\n`);
  }
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
