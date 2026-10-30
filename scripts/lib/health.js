'use strict';

// Turns link/health check results into per-listing status, carrying history
// (last_ok, down_since, failing_runs) forward from the previous health.json.

const { describeCheck } = require('./links');

// A listing failing checks for this long is hidden from the published catalog.
// It is still checked every run, and comes back on its own once it passes.
const HIDE_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'down' if the health endpoint fails, 'degraded' if a public link is broken, else 'healthy'. */
function statusOf(checks) {
  if (checks.some((c) => c.kind === 'health' && c.outcome === 'fail')) return 'down';
  if (checks.some((c) => c.kind === 'link' && c.outcome === 'fail')) return 'degraded';
  return 'healthy';
}

/** ISO date when a listing failing since `downSince` gets hidden, or null if it isn't failing. */
function hideOn(downSince) {
  const t = Date.parse(downSince);
  return Number.isNaN(t) ? null : new Date(t + HIDE_AFTER_DAYS * DAY_MS).toISOString();
}

function summarize({ id, checks }, prev, now) {
  const status = statusOf(checks);
  const health = checks.find((c) => c.kind === 'health');
  const healthy = status === 'healthy';
  const prevBad = prev && prev.status !== 'healthy';
  const downSince = healthy ? null : prevBad ? prev.down_since || now : now;
  const hideAt = downSince ? hideOn(downSince) : null;
  return {
    id,
    status,
    checked_at: now,
    last_ok: healthy ? now : prev?.last_ok || null,
    down_since: downSince,
    failing_runs: healthy ? 0 : (prevBad ? prev.failing_runs || 0 : 0) + 1,
    hide_on: hideAt,
    hidden: Boolean(hideAt && Date.parse(now) >= Date.parse(hideAt)),
    health: health ? { status: health.status, ms: health.ms, via: health.via || null } : null,
    problems: checks.filter((c) => c.outcome === 'fail').map((c) => ({ field: c.field, url: c.url, message: describeCheck(c) })),
    warnings: checks.filter((c) => c.outcome === 'warn').map((c) => ({ field: c.field, url: c.url, message: describeCheck(c) })),
  };
}

function buildHealth(results, previous, now = new Date().toISOString()) {
  const prevById = previous?.listings || {};
  const listings = {};
  for (const r of results) listings[r.id] = summarize(r, prevById[r.id], now);
  const counts = { healthy: 0, degraded: 0, down: 0, hidden: 0 };
  for (const l of Object.values(listings)) {
    counts[l.status]++;
    if (l.hidden) counts.hidden++;
  }
  return { checked_at: now, counts, listings };
}

/** Drops hidden listings from a built catalog (catalog.json shape: { count, listings, ... }). */
function withoutHidden(catalog, health) {
  const hidden = new Set(Object.values(health.listings).filter((l) => l.hidden).map((l) => l.id));
  const listings = catalog.listings.filter((l) => !hidden.has(l.id));
  return { ...catalog, count: listings.length, listings };
}

module.exports = { buildHealth, statusOf, withoutHidden, HIDE_AFTER_DAYS };
