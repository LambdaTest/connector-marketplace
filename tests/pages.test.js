'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFiles, listingFiles } = require('../scripts/lib/validate');
const { buildCatalog } = require('../scripts/build-catalog');
const { connectorPage } = require('../scripts/build-pages');
const { snippets } = require('../scripts/lib/snippets');

const report = validateFiles(listingFiles());
const catalog = buildCatalog(report.listings, report.taxonomy);
const byId = (id) => catalog.listings.find((l) => l.id === id);

test('MCP servers get Claude Code and JSON tabs; CLIs get their own command', () => {
  const P = catalog.taxonomy.protocols;
  assert.deepEqual(snippets(byId('testmu-mcp'), P).map((s) => s[0]), ['Claude Code', 'JSON config']);
  const cli = snippets(byId('hyperexecute-cli'), P);
  assert.deepEqual(cli.map((s) => s[0]), ['Command']);
  assert.match(cli[0][1], /^export LT_USERNAME=<your LT_USERNAME>\nexport LT_ACCESS_KEY=<your LT_ACCESS_KEY>\nhyperexecute /);
  assert.ok(!cli[0][1].includes('claude mcp'));
  assert.deepEqual(snippets({ id: 'x', protocols: ['stdio'], install: { command: 'npx x@1' } }, P).map((s) => s[0]), ['Claude Code', 'JSON config']);
  assert.deepEqual(snippets({ id: 'x', protocols: ['rest'], install: { url: 'https://x.example/app' } }, P).map((s) => s[0]), ['Install']);
});

test('every connector page has a breadcrumb: marketplace › type › name', () => {
  for (const l of catalog.listings) {
    const html = connectorPage(l, catalog, { repoUrl: '' });
    const crumbs = [...html.matchAll(/<li>(?:<a href="([^"]*)">([^<]*)<\/a>|<span aria-current="page">([^<]*)<\/span>)<\/li>/g)];
    assert.equal(crumbs.length, 3, l.id);
    assert.deepEqual([crumbs[0][1], crumbs[0][2]], ['../../', 'Connector Marketplace']);
    assert.equal(crumbs[1][1], `../../?type=${l.type}`);
    assert.equal(crumbs[2][3], l.name.replace(/&/g, '&amp;'));
    assert.ok(html.includes(`<title>${l.name.replace(/&/g, '&amp;')} · TestMu AI Connector Marketplace</title>`));
  }
});

test('listing text is escaped on the page', () => {
  const evil = { ...byId('kane-cli'), name: '<img src=x onerror=alert(1)>', summary: '"><script>x()</script>' };
  const html = connectorPage(evil, catalog, { repoUrl: '' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>x()'));
});

test('report link appears only when the repo is known', () => {
  assert.ok(!connectorPage(byId('kane-cli'), catalog, { repoUrl: '' }).includes('Report a problem'));
  assert.ok(connectorPage(byId('kane-cli'), catalog, { repoUrl: 'https://github.com/o/r' }).includes('https://github.com/o/r/issues/new?template=report-broken-listing.yml'));
});

test('vendor logo shows next to the vendor name on the page', () => {
  const html = connectorPage(byId('testmu-mcp'), catalog, { repoUrl: '' });
  assert.match(html, /<div class="by">by <img class="vendor-logo" src="\.\.\/\.\.\/logos\/vendor-testmu-ai\.png" alt="">/);
  const noLogo = { ...byId('testmu-mcp'), vendor: { ...byId('testmu-mcp').vendor, logo: undefined } };
  assert.ok(!connectorPage(noLogo, catalog, { repoUrl: '' }).includes('vendor-logo"'));
});
