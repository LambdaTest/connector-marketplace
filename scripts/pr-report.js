#!/usr/bin/env node
'use strict';

// Builds the Markdown comment the PR bot posts: a preview of each changed listing
// card plus a checklist of every check, so partners never have to read CI logs.
//
// Usage: node scripts/pr-report.js --base <sha> [--fork] [--logo-base <raw url prefix>] [--out report.md]
// Always exits 0; the gating happens in the checks workflow.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const YAML = require('yaml');
const { validateFiles, listingFiles } = require('./lib/validate');
const { loadTaxonomy, ROOT } = require('./lib/taxonomy');
const { checkListing, describeCheck } = require('./lib/links');
const { checkLogo } = require('./check-logos');
const { scanFile } = require('./scan-secrets');
const { outOfScope } = require('./check-pr-scope');

const MARKER = '<!-- connector-marketplace-bot -->';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Escape text from a listing so it can't inject Markdown, HTML or @mentions. */
function md(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]|#]/g, (c) => `\\${c}`)
    .replace(/@/g, '@\u200b')
    .replace(/\r?\n/g, ' ');
}

function changedFiles(base) {
  const out = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  return {
    changed: out(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]),
    deleted: out(['diff', '--name-only', '--diff-filter=D', `${base}...HEAD`]),
  };
}

const ok = (pass) => (pass ? '✅' : '❌');

function cardPreview(l, taxonomy, logoBase) {
  const label = (list, id) => list.find((x) => x.id === id)?.label || id;
  const stageLabel = (id) => taxonomy.stages.find((s) => s.id === id)?.label || id;
  const logo = logoBase && /^logos\/[a-z0-9-]+\.(svg|png)$/.test(l.logo || '') ? `<img src="${logoBase}${l.logo}" width="48" height="48" align="left" alt="">` : '';
  const rows = [
    ['Vendor', md(l.vendor?.name)],
    ['Works with', (l.products || []).map((p) => md(label(taxonomy.products, p))).join(', ') || '_none listed_'],
    l.integration?.platform ? ['Connects', `${md(l.integration.platform)} ⇄ our products`] : null,
    ['Type', md(label(taxonomy.types, l.type))],
    ['Stages', (l.stages || []).map((s) => md(stageLabel(s))).join(', ')],
    ['Install', l.install?.url ? `remote: ${md(l.install.url)}` : l.install?.command ? `\`${String(l.install.command).replace(/`/g, "'")}\`` : ''],
    ['Badge', md(label(taxonomy.badges, l.badge))],
  ].filter(Boolean);
  const caps = (l.integration?.capabilities || []).map((c) => `- ${md(c)}`).join('\n');
  return [
    `${logo}**${md(l.name)}** · \`${md(l.id)}\`<br>${md(l.summary || '')}`,
    '<br clear="left">',
    '',
    '| | |',
    '| --- | --- |',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    l.integration?.summary ? `> ${md(l.integration.summary)}` : '',
    caps ? `\n${caps}` : '',
  ].join('\n');
}

async function main() {
  const base = arg('--base');
  const isFork = process.argv.includes('--fork');
  const logoBase = arg('--logo-base');
  const outFile = arg('--out') || 'report.md';
  const taxonomy = loadTaxonomy();
  const { changed, deleted } = changedFiles(base);

  const changedListings = changed.filter((f) => /^listings\/[^/]+\.ya?ml$/.test(f));
  const changedLogos = changed.filter((f) => /^logos\//.test(f));
  // Validate all listings so duplicate ids are caught, then report only the changed ones.
  const all = validateFiles(listingFiles(), { taxonomy });
  const byFile = new Map(all.results.map((r) => [r.file, r]));

  const sections = [];
  const reportedLogos = new Set();
  let allPass = true;

  const scope = isFork ? outOfScope(changed) : [];
  const secrets = changed.filter((f) => !/\.(png|jpe?g|gif|ico|webp)$/i.test(f) && fs.existsSync(path.join(ROOT, f))).flatMap((f) => scanFile(path.join(ROOT, f)));
  const logoProblems = changedLogos.flatMap((f) => checkLogo(path.join(ROOT, f)));

  for (const file of changedListings) {
    const result = byFile.get(file) || { ok: false, errors: [{ line: 1, message: 'could not be validated' }] };
    let listing = null;
    try {
      listing = YAML.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    } catch {
      /* reported by validation */
    }
    const errs = result.errors;
    const productErrs = errs.filter((e) => /^(products|integration)/.test(e.message));
    const otherErrs = errs.filter((e) => !productErrs.includes(e));
    const links = listing && typeof listing === 'object' ? (await checkListing(listing, taxonomy)).checks : [];
    const linkFails = links.filter((c) => c.kind === 'link' && c.outcome === 'fail');
    const linkWarns = links.filter((c) => c.outcome === 'warn');
    const health = links.find((c) => c.kind === 'health');
    const fileSecrets = secrets.filter((s) => s.file === file);
    const logoFile = listing?.logo;
    if (logoFile) reportedLogos.add(logoFile);
    const thisLogo = logoProblems.filter((p) => logoFile && p.startsWith(`${logoFile}:`));

    const checks = [
      ['Schema and categories', otherErrs.length === 0, otherErrs.length ? `${otherErrs.length} problem(s), see below` : ''],
      ['Works with our products', productErrs.length === 0, productErrs.length ? 'needs `products` and `integration`' : `${(listing?.products || []).length} product(s)`],
      ['Logo', thisLogo.length === 0 && !errs.some((e) => e.message.startsWith('logo:')), thisLogo.join('; ')],
      ['No secrets', fileSecrets.length === 0, fileSecrets.map((s) => `line ${s.line}: ${s.rule}`).join('; ')],
      ['Links', linkFails.length === 0, linkFails.length ? linkFails.map((c) => md(describeCheck(c))).join('; ') : `${links.filter((c) => c.kind === 'link').length} checked${linkWarns.length ? `, ${linkWarns.length} to check by hand` : ''}`],
      ['Health', !health || health.outcome === 'ok', health ? md(describeCheck(health)) : 'not needed (no health_url)'],
    ];
    const pass = checks.every((c) => c[1]);
    allPass = allPass && pass;

    const problemList = errs.length
      ? `\n<details open><summary>What to fix in <code>${md(file)}</code></summary>\n\n${errs.map((e) => `- line ${e.line}: ${md(e.message)}`).join('\n')}\n\n</details>\n`
      : '';
    sections.push(
      [
        `### ${pass ? '✅' : '❌'} \`${md(file)}\``,
        listing && typeof listing === 'object' ? cardPreview(listing, taxonomy, logoBase) : '_Could not read this file as YAML._',
        '',
        '| Check | | Details |',
        '| --- | --- | --- |',
        ...checks.map(([name, pass, detail]) => `| ${name} | ${ok(pass)} | ${detail || ''} |`),
        problemList,
      ].join('\n'),
    );
  }

  // Secrets or logo problems in files that aren't listings.
  const strayFindings = [
    ...secrets.filter((s) => !changedListings.includes(s.file)).map((s) => `${md(s.file)} line ${s.line}: looks like a ${md(s.rule)}. Remove it and rotate the credential`),
    ...logoProblems.filter((p) => !reportedLogos.has(p.split(':')[0])).map(md),
  ];
  if (strayFindings.length) allPass = false;
  if (scope.length) allPass = false;

  const head = [
    MARKER,
    `## ${allPass ? '✅ Ready for maintainer review' : '❌ Needs changes'}`,
    '',
    changedListings.length
      ? `This PR ${deleted.some((f) => f.startsWith('listings/')) ? 'changes and removes' : 'adds or changes'} ${changedListings.length} listing(s).`
      : deleted.some((f) => f.startsWith('listings/'))
        ? `This PR removes ${deleted.filter((f) => f.startsWith('listings/')).map((f) => `\`${md(f)}\``).join(', ')}.`
        : 'This PR does not change any listings.',
  ];
  if (scope.length) {
    head.push('', `**❌ Partner PRs can only change \`listings/\` and \`logos/\`.** Please remove these files from the PR: ${scope.map((f) => `\`${md(f)}\``).join(', ')}`);
  }
  if (strayFindings.length) head.push('', '**Other problems**', ...strayFindings.map((f) => `- ${f}`));

  const footer = [
    '---\n',
    '<sub>Updated on every push. Run <code>npm run check</code> locally to see the same results. ',
    'Maintainers review once all checks pass. Questions? See CONTRIBUTING.md.</sub>',
  ].join('');

  const body = [...head, '', ...sections, footer].join('\n');
  fs.writeFileSync(outFile, body.length > 60000 ? `${body.slice(0, 60000)}\n\n_Report truncated._\n` : body);
  console.log(body);
  return 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { md, cardPreview, MARKER };
