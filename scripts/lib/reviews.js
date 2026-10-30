'use strict';

// Ratings come from "Rate a connector" issues (.github/ISSUE_TEMPLATE/review-connector.yml).
// This module parses those issues and turns them into per-listing ratings.

const HIDDEN_LABEL = 'review-hidden';
const MAX_TEXT = 600;
const RECENT = 5;

/** Split an issue-form body into { "Heading": "value" }. */
function formSections(body) {
  const out = {};
  const parts = String(body || '').split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
    const value = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    out[heading] = value === '_No response_' ? '' : value;
  }
  return out;
}

/**
 * Parse one review issue body. Returns { listing, rating, text, notAffiliated }
 * or { error } with a message the triage bot can show the reviewer.
 */
function parseReview(body) {
  const s = formSections(body);
  const listing = (s['Connector id'] || '').replace(/`/g, '').trim().toLowerCase().replace(/\.ya?ml$/, '');
  const ratingMatch = (s.Rating || '').match(/^\s*([1-5])\b/);
  const notAffiliated = /-\s*\[x\]/i.test(s.Affiliation || '');
  if (!listing) return { error: 'The connector id is missing.' };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(listing)) return { error: `"${listing}" is not a valid connector id.` };
  if (!ratingMatch) return { error: 'Pick a rating from 1 to 5.' };
  if (!notAffiliated) return { error: 'Confirm that you don\'t work for the company that makes this connector.' };
  const text = (s.Review || '').replace(/\r/g, '').trim();
  return {
    listing,
    rating: Number(ratingMatch[1]),
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    notAffiliated,
  };
}

const labelNames = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));

/**
 * Aggregate review issues into ratings.
 * issues: GitHub issue objects ({ number, html_url, user: { login }, created_at, updated_at, body, labels })
 * listings: catalog listings (for ids and vendor orgs)
 * affiliated: Set of "login@org" pairs to drop (reviewer is a public member of the vendor's GitHub org)
 */
function aggregateRatings(issues, listings, { affiliated = new Set(), now = new Date().toISOString() } = {}) {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const latest = new Map(); // `${listing}|${login}` -> review

  for (const issue of issues) {
    if (labelNames(issue).includes(HIDDEN_LABEL)) continue;
    const login = issue.user?.login;
    if (!login || issue.user?.type === 'Bot') continue;
    const r = parseReview(issue.body);
    if (r.error || !byId.has(r.listing)) continue;
    const org = byId.get(r.listing).vendor?.github;
    if (org && (login.toLowerCase() === org.toLowerCase() || affiliated.has(`${login.toLowerCase()}@${org.toLowerCase()}`))) continue;

    const review = { login, rating: r.rating, text: r.text, date: issue.updated_at || issue.created_at, url: issue.html_url, created: issue.created_at };
    const key = `${r.listing}|${login.toLowerCase()}`;
    const prev = latest.get(key);
    if (!prev || review.created > prev.created || (review.created === prev.created && review.date > prev.date)) latest.set(key, { ...review, listing: r.listing });
  }

  const ratings = {};
  for (const review of latest.values()) {
    const entry = (ratings[review.listing] ||= { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, recent: [] });
    entry.count++;
    entry.distribution[review.rating]++;
    entry.recent.push(review);
  }
  for (const entry of Object.values(ratings)) {
    const sum = Object.entries(entry.distribution).reduce((acc, [stars, n]) => acc + Number(stars) * n, 0);
    entry.average = Math.round((sum / entry.count) * 10) / 10;
    entry.recent = entry.recent
      .filter((r) => r.text)
      .sort((a, b) => (a.created < b.created ? 1 : -1))
      .slice(0, RECENT)
      .map(({ login, rating, text, date, url }) => ({ login, rating, text, date, url }));
  }
  return { generated_at: now, listings: ratings };
}

module.exports = { parseReview, aggregateRatings, formSections, HIDDEN_LABEL };
