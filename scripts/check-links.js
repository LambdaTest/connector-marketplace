#!/usr/bin/env node
'use strict';

// Checks that public URLs in listings resolve, and that health_url is healthy.
// Usage: node scripts/check-links.js [listings/x.yaml ...]   (default: all listings)

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const { listingFiles } = require('./lib/validate');
const { loadTaxonomy, ROOT } = require('./lib/taxonomy');
const { checkListing, describeCheck } = require('./lib/links');

async function main(argv) {
  const taxonomy = loadTaxonomy();
  const files = argv.length ? argv : listingFiles();
  let errors = 0;
  let warnings = 0;
  let total = 0;

  for (const file of files) {
    let listing;
    try {
      listing = YAML.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue; // unparseable files are reported by validate.js
    }
    if (!listing || typeof listing !== 'object') continue;
    const rel = path.relative(ROOT, path.resolve(file));
    const { checks } = await checkListing(listing, taxonomy);
    for (const c of checks) {
      total++;
      const line = `${rel}  ${c.field}  ${describeCheck(c)}`;
      if (c.outcome === 'ok') {
        console.log(`✔ ${line}`);
      } else if (c.outcome === 'warn') {
        warnings++;
        console.log(`⚠ ${line}: ${c.url}`);
        if (process.env.GITHUB_ACTIONS) console.log(`::warning file=${rel}::${c.field} ${describeCheck(c)}: ${c.url}`);
      } else {
        errors++;
        console.log(`✖ ${line}: ${c.url}`);
        if (process.env.GITHUB_ACTIONS) console.log(`::error file=${rel}::${describeCheck(c)}: ${c.url}`);
      }
    }
  }
  console.log(`\n${total} URL(s) checked, ${errors} broken, ${warnings} warning(s)`);
  return errors ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
