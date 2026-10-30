#!/usr/bin/env node
'use strict';

// Usage: node scripts/validate.js [listing.yaml ...]
// With no arguments, validates every file in listings/.

const { validateFiles, listingFiles, formatResults } = require('./lib/validate');

function main(argv) {
  const files = argv.length ? argv : listingFiles();
  if (!files.length) {
    console.error('No listing files found.');
    return 1;
  }
  let report;
  try {
    report = validateFiles(files);
  } catch (err) {
    console.error(`Could not run validation:\n${err.message}`);
    return 2;
  }
  console.log(formatResults(report.results));
  return report.results.every((r) => r.ok) ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
