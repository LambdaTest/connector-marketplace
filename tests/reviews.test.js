'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseReview, aggregateRatings } = require('../scripts/lib/reviews');

// Issue bodies exactly as GitHub renders the review-connector.yml form.
function body({ listing = 'smartui-cli', rating = '5 ★★★★★ Excellent', review = 'Works great.', affiliated = false } = {}) {
  return [
    '### Connector id', '', listing, '',
    '### Rating', '', rating, '',
    '### Review', '', review || '_No response_', '',
    '### Affiliation', '', `- [${affiliated ? ' ' : 'X'}] I don't work for the company that makes this connector`,
  ].join('\n');
}

let n = 0;
function issue(login, opts = {}, extra = {}) {
  n++;
  return {
    number: n,
    html_url: `https://github.com/o/r/issues/${n}`,
    user: { login, type: 'User' },
    created_at: extra.created_at || `2026-10-0${Math.min(n, 9)}T10:00:00Z`,
    updated_at: extra.updated_at || extra.created_at || `2026-10-0${Math.min(n, 9)}T10:00:00Z`,
    labels: extra.labels || [{ name: 'review' }],
    body: body(opts),
  };
}

const listings = [
  { id: 'smartui-cli', vendor: { github: 'LambdaTest' } },
  { id: 'acme-jira', vendor: { github: 'acme-apps' } },
];

test('parses a review issue form', () => {
  assert.deepEqual(parseReview(body()), { listing: 'smartui-cli', rating: 5, text: 'Works great.', notAffiliated: true });
  assert.equal(parseReview(body({ review: '' })).text, '');
  assert.equal(parseReview(body({ listing: '`SmartUI-CLI.yaml`' })).listing, 'smartui-cli');
});

test('rejects incomplete reviews with a readable reason', () => {
  assert.match(parseReview(body({ listing: '' })).error, /connector id is missing/);
  assert.match(parseReview(body({ listing: 'not valid!' })).error, /not a valid connector id/);
  assert.match(parseReview(body({ rating: '_No response_' })).error, /rating from 1 to 5/);
  assert.match(parseReview(body({ affiliated: true })).error, /don't work for the company/);
});

test('aggregates: latest rating per user counts once', () => {
  n = 0;
  const issues = [
    issue('alice', { rating: '2 ★★ Poor' }, { created_at: '2026-10-01T00:00:00Z' }),
    issue('alice', { rating: '5 ★★★★★ Excellent', review: 'Fixed now.' }, { created_at: '2026-10-05T00:00:00Z' }),
    issue('bob', { rating: '4 ★★★★ Good', review: '' }),
    issue('carol', { rating: '3 ★★★ OK' }),
  ];
  const { listings: r } = aggregateRatings(issues, listings, { now: 'T' });
  assert.equal(r['smartui-cli'].count, 3);
  assert.equal(r['smartui-cli'].average, 4);
  assert.deepEqual(r['smartui-cli'].distribution, { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
  // Recent reviews only include ones with text, newest first.
  assert.deepEqual(r['smartui-cli'].recent.map((x) => x.login), ['alice', 'carol']);
  assert.equal(r['smartui-cli'].recent[0].text, 'Fixed now.');
});

test('drops hidden, invalid, unknown, bot and vendor reviews', () => {
  n = 0;
  const issues = [
    issue('spammer', {}, { labels: [{ name: 'review' }, { name: 'review-hidden' }] }),
    issue('dana', { rating: '_No response_' }),
    issue('erin', { listing: 'does-not-exist' }),
    { ...issue('ci-bot'), user: { login: 'ci-bot', type: 'Bot' } },
    issue('LambdaTest'),
    issue('insider', { listing: 'acme-jira' }),
    issue('frank', { listing: 'acme-jira', rating: '1 ★ Didn\'t work', review: 'Could not connect.' }),
  ];
  const { listings: r } = aggregateRatings(issues, listings, { affiliated: new Set(['insider@acme-apps']) });
  assert.equal(r['smartui-cli'], undefined);
  assert.equal(r['acme-jira'].count, 1);
  assert.equal(r['acme-jira'].average, 1);
});
