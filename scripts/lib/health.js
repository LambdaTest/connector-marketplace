'use strict';

// Turns link/health check results into per-listing status, carrying history
// (last_ok, down_since, failing_runs) forward from the previous health.json.

const { describeCheck } = require('./links');

/** 'down' if the health endpoint fails, 'degraded' if a public link is broken, else 'healthy'. */
function statusOf(checks) {
  if (checks.some((c) => c.kind === 'health' && c.outcome === 'fail')) return 'down';
  if (checks.some((c) => c.kind === 'link' && c.outcome === 'fail')) return 'degraded';
  return 'healthy';
}

function summarize({ id, checks }, prev, now) {
  const status = statusOf(checks);
  const health = checks.find((c) => c.kind === 'health');
  const healthy = status === 'healthy';
  const prevBad = prev && prev.status !== 'healthy';
  return {
    id,
    status,
    checked_at: now,
    last_ok: healthy ? now : prev?.last_ok || null,
    down_since: healthy ? null : prevBad ? prev.down_since || now : now,
    failing_runs: healthy ? 0 : (prevBad ? prev.failing_runs || 0 : 0) + 1,
    health: health ? { status: health.status, ms: health.ms, via: health.via || null } : null,
    problems: checks.filter((c) => c.outcome === 'fail').map((c) => ({ field: c.field, url: c.url, message: describeCheck(c) })),
    warnings: checks.filter((c) => c.outcome === 'warn').map((c) => ({ field: c.field, url: c.url, message: describeCheck(c) })),
  };
}

function buildHealth(results, previous, now = new Date().toISOString()) {
  const prevById = previous?.listings || {};
  const listings = {};
  for (const r of results) listings[r.id] = summarize(r, prevById[r.id], now);
  const counts = { healthy: 0, degraded: 0, down: 0 };
  for (const l of Object.values(listings)) counts[l.status]++;
  return { checked_at: now, counts, listings };
}

module.exports = { buildHealth, statusOf };
