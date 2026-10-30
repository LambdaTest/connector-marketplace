'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const YAML = require('yaml');

const { validateFiles, listingFiles } = require('../scripts/lib/validate');
const { loadTaxonomy, ROOT } = require('../scripts/lib/taxonomy');
const { buildCatalog } = require('../scripts/build-catalog');
const { checkLogo } = require('../scripts/check-logos');
const { scanFile } = require('../scripts/scan-secrets');

const FIXTURES = path.join(__dirname, 'fixtures', 'invalid');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-test-'));

function writeListing(name, listing) {
  const file = path.join(tmp, `${name}.yaml`);
  fs.writeFileSync(file, YAML.stringify(listing));
  return file;
}

function sample() {
  const listing = YAML.parse(fs.readFileSync(path.join(ROOT, 'listings', 'testmu-jenkins.yaml'), 'utf8'));
  return { ...listing, badge: 'community' };
}

function runCli(script, args) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout };
  }
}

test('all sample listings are valid', () => {
  const files = listingFiles();
  assert.ok(files.length >= 5, 'expected at least 5 sample listings');
  const { results } = validateFiles(files);
  for (const r of results) assert.deepEqual(r.errors, [], `${r.file} should be valid`);
});

test('broken listing fails with readable, located errors', () => {
  const { results } = validateFiles([path.join(FIXTURES, 'broken-listing.yaml')]);
  const [r] = results;
  assert.equal(r.ok, false);
  const text = r.errors.map((e) => `${e.line} ${e.message}`).join('\n');

  assert.match(text, /^1 docs_url: required field is missing$/m);
  assert.match(text, /^6 type: "mcp" is not a known type\. Did you mean "mcp-server"\?/m);
  assert.match(text, /stages\[0\]: "testing" is not a known stage/);
  assert.match(text, /docs: unknown field\. Did you mean "docs_url"\?/);
  assert.match(text, /vendor\.url: must be an https:\/\/ URL/);
  assert.match(text, /support: needs at least one of `email` or `url`/);
  assert.match(text, /install\.command: required because protocols include "stdio"/);
  assert.match(text, /logo: file "logos\/acme\.svg" does not exist/);
  assert.match(text, /health_url: required for the "verified" badge/);
  assert.match(text, /is not in VERIFIED\.md/);
  // No raw ajv noise.
  assert.doesNotMatch(text, /must match "anyOf"|must have required property/);
});

test('connectors that do not work with our products are rejected', () => {
  const { results } = validateFiles([path.join(__dirname, 'fixtures', 'rejected', 'sentry-mcp.yaml')]);
  const text = results[0].errors.map((e) => e.message).join('\n');
  assert.match(text, /products: required\. Name which of our products/);
  assert.match(text, /not accepted/);
  assert.match(text, /integration: required field is missing/);

  const empty = writeListing('no-products', { ...sample(), id: 'no-products', products: [] });
  assert.match(validateFiles([empty]).results[0].errors.map((e) => e.message).join('\n'), /products: list at least one of our products/);

  const unknown = writeListing('wrong-product', { ...sample(), id: 'wrong-product', products: ['smart-ui'] });
  assert.match(validateFiles([unknown]).results[0].errors.map((e) => e.message).join('\n'), /"smart-ui" is not a known product\. Did you mean "smartui"\?/);
});

test('example partner listings are valid', () => {
  const root = path.join(ROOT, 'examples');
  const files = listingFiles(path.join(root, 'listings'));
  assert.ok(files.length >= 1);
  const { results } = validateFiles(files, { root });
  for (const r of results) assert.deepEqual(r.errors, [], `${r.file} should be valid`);
});

test('YAML syntax errors are reported, not thrown', () => {
  const { results } = validateFiles([path.join(FIXTURES, 'bad-yaml.yaml')]);
  assert.equal(results[0].ok, false);
  assert.match(results[0].errors[0].message, /^YAML syntax error/);
});

test('CLI exits 0 for good listings and 1 for broken ones', () => {
  const good = runCli('validate.js', []);
  assert.equal(good.code, 0);
  assert.match(good.stdout, /All \d+ listing\(s\) valid/);

  const bad = runCli('validate.js', [path.join(FIXTURES, 'broken-listing.yaml')]);
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /tests\/fixtures\/invalid\/broken-listing\.yaml:6 {2}type:/);
});

test('file name must match id, and ids must be unique', () => {
  const a = writeListing('dup-one', { ...sample(), id: 'dup-one' });
  const b = writeListing('dup-two', { ...sample(), id: 'dup-one' });
  const { results } = validateFiles([a, b]);
  assert.equal(results[0].ok, true);
  const msgs = results[1].errors.map((e) => e.message).join('\n');
  assert.match(msgs, /must match the file name "dup-two\.yaml"/);
  assert.match(msgs, /already used by/);
});

test('categories come only from taxonomy.yaml', () => {
  // A value added to the taxonomy is accepted without touching schema or scripts.
  const taxonomy = loadTaxonomy();
  taxonomy.types.push({ id: 'browser-extension', label: 'Browser Extension' });
  taxonomy.ids.type.push('browser-extension');
  const file = writeListing('ext-listing', { ...sample(), id: 'ext-listing', type: 'browser-extension' });
  assert.equal(validateFiles([file]).results[0].ok, false, 'unknown before it is in the taxonomy');
  assert.equal(validateFiles([file], { taxonomy }).results[0].ok, true, 'known once added');

  // And no taxonomy id is written as a string literal in schema or scripts.
  const ids = Object.values(taxonomy.ids).flat();
  const sources = [
    path.join(ROOT, 'schema', 'listing.schema.json'),
    ...fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'scripts', f)),
    ...fs.readdirSync(path.join(ROOT, 'scripts', 'lib')).map((f) => path.join(ROOT, 'scripts', 'lib', f)),
  ];
  for (const src of sources) {
    const text = fs.readFileSync(src, 'utf8');
    for (const id of ids) {
      assert.ok(!new RegExp(`["'\`]${id}["'\`]`).test(text), `${path.relative(ROOT, src)} hardcodes category "${id}"`);
    }
  }
});

test('catalog has every listing, sorted, with facet counts', () => {
  const { listings, taxonomy } = validateFiles(listingFiles());
  const catalog = buildCatalog(listings, taxonomy);
  assert.equal(catalog.count, listings.length);
  assert.deepEqual(catalog.listings.map((l) => l.id), listings.map((l) => l.id).sort());
  const typeTotal = Object.values(catalog.facets.types).reduce((a, b) => a + b, 0);
  assert.equal(typeTotal, listings.length);
});

test('logo check rejects active SVG content and non-square images', () => {
  const evil = path.join(tmp, 'evil.svg');
  fs.writeFileSync(evil, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>');
  assert.match(checkLogo(evil).join('\n'), /<script>/);

  const wide = path.join(tmp, 'wide.svg');
  fs.writeFileSync(wide, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"></svg>');
  assert.match(checkLogo(wide).join('\n'), /must be square/);

  for (const f of fs.readdirSync(path.join(ROOT, 'logos'))) {
    assert.deepEqual(checkLogo(path.join(ROOT, 'logos', f)), [], f);
  }
});

test('secret scan flags credentials without echoing them', () => {
  const file = path.join(tmp, 'leaky.yaml');
  const fake = ['ghp', 'A'.repeat(36)].join('_');
  fs.writeFileSync(file, `id: leaky\ninstall:\n  url: https://api.example.com/mcp?api_key=abcdef1234567890\n  token: ${fake}\n`);
  const hits = scanFile(file);
  assert.deepEqual(hits.map((h) => h.line), [3, 4]);
  assert.ok(hits.some((h) => h.rule === 'GitHub token'));
  assert.ok(hits.every((h) => !JSON.stringify(h).includes(fake)));

  for (const f of listingFiles()) assert.deepEqual(scanFile(f), [], f);
});

test('secret scan finds access keys in comments and shell snippets', () => {
  const file = path.join(tmp, 'leaky-comment.yaml');
  const key = ['LT', 'aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5'].join('_');
  fs.writeFileSync(file, [
    'id: leaky-comment',
    `# setup: LT_ACCESS_KEY=${key}`,
    '  command: run --token abcdefghij0123456789xyz',
    'install:',
    '  env:',
    '    - name: LT_ACCESS_KEY',
    '      secret: true',
    '      description: Your access key from the account settings page.',
  ].join('\n'));
  const hits = scanFile(file);
  assert.deepEqual(hits.map((h) => [h.line, h.rule]), [[2, 'TestMu AI access key']]);
});

test('vendor.logo must be a logos/ path to a file that exists', () => {
  const missing = writeListing('vendor-logo-missing', { ...sample(), id: 'vendor-logo-missing', vendor: { ...sample().vendor, logo: 'logos/vendor-nope.svg' } });
  const bad = writeListing('vendor-logo-bad', { ...sample(), id: 'vendor-logo-bad', vendor: { ...sample().vendor, logo: 'https://acme.example/logo.png' } });
  const [m, b] = validateFiles([missing, bad]).results;
  assert.ok(m.errors.some((e) => e.message.startsWith('vendor.logo: file "logos/vendor-nope.svg" does not exist')), JSON.stringify(m.errors));
  assert.ok(b.errors.some((e) => e.message.startsWith('vendor.logo: "https://acme.example/logo.png" must look like logos/')), JSON.stringify(b.errors));
});
