#!/usr/bin/env node
'use strict';

// Looks for credentials accidentally pasted into listings or logos.
// Usage: node scripts/scan-secrets.js [file ...]   (default: listings/ and logos/)

const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./lib/taxonomy');

const RULES = [
  ['Private key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Slack webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe live key', /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/],
  ['OpenAI / Anthropic key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['JSON Web Token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['Password in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s/@]+@/i],
  ['Credential in URL query', /[?&](?:api[_-]?key|access[_-]?key|token|secret|password|auth|sig)=[^&\s"']{8,}/i],
  ['Hard-coded secret value', /^\s*(?:value|password|secret|token|api[_-]?key|access[_-]?key)\s*:\s*["']?[A-Za-z0-9_\-+/=]{16,}["']?\s*$/im],
];

function scanFile(file) {
  const rel = path.relative(ROOT, path.resolve(file));
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const [name, re] of RULES) {
      if (re.test(line)) {
        hits.push({ file: rel, line: i + 1, rule: name });
        break; // one report per line; specific rules come first
      }
    }
  });
  return hits;
}

function defaultFiles() {
  return ['listings', 'logos'].flatMap((d) =>
    fs
      .readdirSync(path.join(ROOT, d))
      .filter((f) => /\.(ya?ml|json|svg)$/.test(f))
      .map((f) => path.join(ROOT, d, f)),
  );
}

function main(argv) {
  const files = (argv.length ? argv : defaultFiles()).filter((f) => fs.existsSync(f) && !/\.png$/i.test(f));
  const hits = files.flatMap(scanFile);
  for (const h of hits) {
    // Never echo the matched text: the point is to keep it out of logs.
    console.log(`✖ ${h.file}:${h.line}  looks like a ${h.rule}. Remove it and rotate the credential`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error file=${h.file},line=${h.line}::Possible ${h.rule}. Remove it and rotate the credential.`);
  }
  console.log(hits.length ? `\n${hits.length} possible secret(s) found` : `No secrets found in ${files.length} file(s)`);
  return hits.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { scanFile };
