'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHealth } = require('../scripts/lib/health');
const { md } = require('../scripts/pr-report');

const ok = { field: 'docs_url', url: 'https://a.example', kind: 'link', status: 200, ms: 50, outcome: 'ok' };
const brokenLink = { ...ok, status: 404, outcome: 'fail' };
const healthOk = { field: 'health_url', url: 'https://h.example', kind: 'health', status: 200, ms: 80, outcome: 'ok' };
const healthDown = { ...healthOk, status: 503, outcome: 'fail' };

test('status: down beats degraded beats healthy', () => {
  const h = buildHealth(
    [
      { id: 'a', checks: [ok, healthOk] },
      { id: 'b', checks: [brokenLink, healthOk] },
      { id: 'c', checks: [ok, healthDown] },
    ],
    null,
    'T1',
  );
  assert.equal(h.listings.a.status, 'healthy');
  assert.equal(h.listings.b.status, 'degraded');
  assert.equal(h.listings.c.status, 'down');
  assert.deepEqual(h.counts, { healthy: 1, degraded: 1, down: 1 });
});

test('history carries forward across runs', () => {
  const run1 = buildHealth([{ id: 'x', checks: [healthOk] }], null, 'T1');
  assert.equal(run1.listings.x.last_ok, 'T1');
  assert.equal(run1.listings.x.down_since, null);

  const run2 = buildHealth([{ id: 'x', checks: [healthDown] }], run1, 'T2');
  assert.equal(run2.listings.x.down_since, 'T2');
  assert.equal(run2.listings.x.last_ok, 'T1');
  assert.equal(run2.listings.x.failing_runs, 1);

  const run3 = buildHealth([{ id: 'x', checks: [healthDown] }], run2, 'T3');
  assert.equal(run3.listings.x.down_since, 'T2', 'keeps the first failure time');
  assert.equal(run3.listings.x.failing_runs, 2);

  const run4 = buildHealth([{ id: 'x', checks: [healthOk] }], run3, 'T4');
  assert.equal(run4.listings.x.status, 'healthy');
  assert.equal(run4.listings.x.down_since, null);
  assert.equal(run4.listings.x.failing_runs, 0);
});

test('PR report escapes listing text', () => {
  const out = md('<img src=x onerror=alert(1)> | @everyone **bold**\nnext');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('@everyone'));
  assert.ok(!/(^|[^\\])\|/.test(out), 'pipes are escaped so table rows stay intact');
  assert.ok(!out.includes('\n'));
});
