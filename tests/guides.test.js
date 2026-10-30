'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderGuide, GUIDES } = require('../scripts/build-guides');

const REPO = 'https://github.com/LambdaTest/connector-marketplace';
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const ids = (html) => new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

for (const guide of GUIDES) {
  test(`${guide.src}: every in-page anchor has a heading`, () => {
    const { body } = renderGuide(guide, REPO);
    const missing = hrefs(body).filter((h) => h.startsWith('#') && !ids(body).has(h.slice(1)));
    assert.deepEqual(missing, []);
  });

  test(`${guide.src}: links to other guides point at built pages, repo files at GitHub`, () => {
    const { body } = renderGuide(guide, REPO);
    const own = hrefs(body).filter((h) => !/^(https?:|mailto:|#)/.test(h));
    for (const h of own) assert.ok(GUIDES.some((g) => h.split('#')[0] === g.out), `unexpected relative link ${h}`);
    const repoLinks = hrefs(body).filter((h) => h.startsWith(REPO));
    assert.ok(repoLinks.every((h) => /\/(blob|tree)\/main\//.test(h)), repoLinks.join(', '));
  });

  test(`${guide.src}: without a repo URL, repo-file links become plain text`, () => {
    const { body } = renderGuide(guide, '');
    assert.ok(!hrefs(body).some((h) => h === '' || /\.(md|ya?ml)$/.test(h) && !/^https?:/.test(h)));
  });
}

test('contributing guide links to the building guide', () => {
  const { body } = renderGuide(GUIDES[0], REPO);
  assert.ok(hrefs(body).includes('building-a-connector.html'));
  assert.ok(hrefs(body).includes(`${REPO}/blob/main/taxonomy.yaml`));
});
