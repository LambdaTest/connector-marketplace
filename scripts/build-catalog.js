#!/usr/bin/env node
'use strict';

// Validates every listing, then writes dist/catalog.json.
// Output is deterministic (sorted, no timestamps) so diffs stay readable.

const fs = require('node:fs');
const path = require('node:path');
const { validateFiles, listingFiles, formatResults } = require('./lib/validate');
const { ROOT } = require('./lib/taxonomy');

function buildCatalog(listings, taxonomy) {
  const facet = (key, ids) =>
    Object.fromEntries(
      ids.map((id) => [id, listings.filter((l) => [].concat(l[key]).includes(id)).length]),
    );

  return {
    catalog_version: 1,
    taxonomy_version: taxonomy.version,
    source_commit: process.env.GITHUB_SHA || null,
    count: listings.length,
    taxonomy: {
      products: taxonomy.products,
      stage_groups: taxonomy.stageGroups,
      types: taxonomy.types,
      protocols: taxonomy.protocols,
      // verified_registry: only maintainers can grant it (pages show a shield for these).
      badges: taxonomy.badges.map(({ id, label, description, verified_registry }) => ({ id, label, description, verified_registry: Boolean(verified_registry) })),
    },
    facets: {
      products: facet('products', taxonomy.ids.product),
      stages: facet('stages', taxonomy.ids.stage),
      types: facet('type', taxonomy.ids.type),
      protocols: facet('protocols', taxonomy.ids.protocol),
      badges: facet('badge', taxonomy.ids.badge),
      // Free text from listings, not a taxonomy category: which outside tools are connected.
      platforms: listings.reduce((acc, l) => {
        const p = l.integration.platform;
        if (p) acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {}),
    },
    listings: [...listings].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function main() {
  const report = validateFiles(listingFiles());
  if (!report.results.every((r) => r.ok)) {
    console.error(formatResults(report.results));
    console.error('\nCatalog not built: fix the listings above first.');
    return 1;
  }
  const catalog = buildCatalog(report.listings, report.taxonomy);
  const out = path.join(ROOT, 'dist', 'catalog.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Wrote ${path.relative(ROOT, out)} with ${catalog.count} listing(s)`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { buildCatalog };
