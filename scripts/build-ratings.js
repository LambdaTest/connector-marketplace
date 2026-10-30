#!/usr/bin/env node
'use strict';

// Collects "Rate a connector" issues from GitHub and writes ratings.json for the site.
// Usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=org/repo node scripts/build-ratings.js --out dist/site/ratings.json
//
// Without GITHUB_TOKEN / GITHUB_REPOSITORY (local builds) it writes an empty ratings file.
// Never fails the build: if GitHub can't be reached, the site ships without ratings.

const fs = require('node:fs');
const path = require('node:path');
const { validateFiles, listingFiles } = require('./lib/validate');
const { aggregateRatings, parseReview } = require('./lib/reviews');

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function gh(url, token) {
  const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(15_000),
  });
  return res;
}

async function allReviewIssues(repo, token) {
  const issues = [];
  let url = `/repos/${repo}/issues?labels=review&state=all&per_page=100`;
  while (url) {
    const res = await gh(url, token);
    if (!res.ok) throw new Error(`GitHub API ${res.status} listing review issues`);
    issues.push(...(await res.json()).filter((i) => !i.pull_request));
    url = (res.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return issues;
}

/** Reviewers who are public members of the vendor's GitHub org don't count. */
async function affiliatedPairs(issues, listings, token) {
  const orgOf = new Map(listings.map((l) => [l.id, l.vendor?.github]));
  const checked = new Map();
  for (const issue of issues) {
    const login = issue.user?.login;
    const org = orgOf.get(parseReview(issue.body).listing);
    if (!login || !org) continue;
    const key = `${login.toLowerCase()}@${org.toLowerCase()}`;
    if (checked.has(key)) continue;
    const res = await gh(`/orgs/${org}/public_members/${login}`, token);
    checked.set(key, res.status === 204);
  }
  return new Set([...checked].filter(([, member]) => member).map(([key]) => key));
}

async function main() {
  const out = arg('--out') || 'dist/site/ratings.json';
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const { listings } = validateFiles(listingFiles());

  let ratings = { generated_at: new Date().toISOString(), listings: {} };
  if (token && repo) {
    try {
      const issues = await allReviewIssues(repo, token);
      const affiliated = await affiliatedPairs(issues, listings, token);
      ratings = aggregateRatings(issues, listings, { affiliated });
      console.log(`${issues.length} review issue(s) → ratings for ${Object.keys(ratings.listings).length} connector(s)`);
    } catch (err) {
      console.log(`::warning::Could not collect reviews (${err.message}); publishing without ratings`);
    }
  } else {
    console.log('No GITHUB_TOKEN/GITHUB_REPOSITORY: writing empty ratings');
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(ratings)}\n`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
});
