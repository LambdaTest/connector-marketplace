#!/usr/bin/env node
'use strict';

// Partner PRs may only add or change their own listing and logo.
// Anything else (scripts, schema, taxonomy, workflows, VERIFIED.md) needs a maintainer PR,
// because fork PRs run their own copy of the checks.
//
// Usage: node scripts/check-pr-scope.js <changed-file> ...

const ALLOWED = [/^listings\/[a-z0-9-]+\.yaml$/, /^logos\/[a-z0-9-]+\.(svg|png)$/];

function outOfScope(files) {
  return files.filter((f) => f && !ALLOWED.some((re) => re.test(f)));
}

function main(files) {
  const bad = outOfScope(files);
  if (!bad.length) {
    console.log(`✔ ${files.length} changed file(s), all under listings/ or logos/`);
    return 0;
  }
  console.log('✖ Partner PRs can only add or change files in listings/ and logos/.');
  console.log('  These files need a separate PR from a maintainer:');
  for (const f of bad) {
    console.log(`    ${f}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${f}::Partner PRs can only change listings/ and logos/. Ask a maintainer to change this file.`);
  }
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { outOfScope };
