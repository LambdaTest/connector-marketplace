#!/usr/bin/env node
'use strict';

// Builds the static marketplace site into dist/site/:
//   index.html, catalog.json, logos/, .nojekyll
// health.json is written next to it by scripts/check-health.js.
// The repo link comes from GITHUB_REPOSITORY in Actions, or REPO_URL locally.

const fs = require('node:fs');
const path = require('node:path');
const { validateFiles, listingFiles, formatResults } = require('./lib/validate');
const { buildCatalog } = require('./build-catalog');
const { ROOT } = require('./lib/taxonomy');

function main() {
  const report = validateFiles(listingFiles());
  if (!report.results.every((r) => r.ok)) {
    console.error(formatResults(report.results));
    console.error('\nSite not built: fix the listings above first.');
    return 1;
  }
  const out = path.join(ROOT, 'dist', 'site');
  fs.mkdirSync(path.join(out, 'logos'), { recursive: true });

  const catalog = buildCatalog(report.listings, report.taxonomy);
  fs.writeFileSync(path.join(out, 'catalog.json'), `${JSON.stringify(catalog)}\n`);

  const used = new Set(catalog.listings.map((l) => l.logo));
  for (const logo of used) fs.copyFileSync(path.join(ROOT, logo), path.join(out, logo));

  const repoUrl =
    process.env.REPO_URL ||
    (process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}` : '');
  // Ratings stay off unless the RATINGS_ENABLED repo variable (or env var) is 'true'.
  const ratingsEnabled = process.env.RATINGS_ENABLED === 'true';
  const html = fs
    .readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8')
    .replace("/*REPO_URL*/''", JSON.stringify(repoUrl))
    .replace('/*RATINGS_ENABLED*/false', String(ratingsEnabled));
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  console.log(`Built ${path.relative(ROOT, out)}/ with ${catalog.count} listing(s)${repoUrl ? ` (repo: ${repoUrl})` : ''}${ratingsEnabled ? ', ratings on' : ''}`);
  return 0;
}

process.exitCode = main();
