'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { loadTaxonomy, ROOT } = require('./taxonomy');

// Maps a schema $defs entry to the taxonomy list that fills its enum.
const TAXONOMY_DEFS = { product: 'product', type: 'type', stage: 'stage', protocol: 'protocol', badge: 'badge' };

// Friendly text for anyOf rules, keyed by the field they sit on.
const ANY_OF_HINTS = {
  '/install': 'needs `url` (remote connector), `command` (local connector), or both',
  '/support': 'needs at least one of `email` or `url`',
};

function buildSchema(taxonomy, schemaFile = path.join(ROOT, 'schema', 'listing.schema.json')) {
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  for (const [def, key] of Object.entries(TAXONOMY_DEFS)) {
    schema.$defs[def] = { ...schema.$defs[def], enum: taxonomy.ids[key] };
  }
  return schema;
}

function compile(taxonomy) {
  const ajv = new Ajv2020({ allErrors: true, verbose: true, strict: true, strictRequired: false });
  addFormats(ajv);
  return ajv.compile(buildSchema(taxonomy));
}

/** Ids listed in the first column of the table in VERIFIED.md. */
function loadVerifiedIds(file = path.join(ROOT, 'VERIFIED.md')) {
  if (!fs.existsSync(file)) return new Set();
  const ids = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function suggest(value, options) {
  if (typeof value !== 'string') return null;
  const v = value.toLowerCase();
  let best = null;
  let bestScore = Infinity;
  for (const opt of options) {
    const score = opt.includes(v) || v.includes(opt) ? 1 : levenshtein(v, opt);
    if (score < bestScore) {
      best = opt;
      bestScore = score;
    }
  }
  return bestScore <= Math.max(2, Math.floor(v.length / 3)) ? best : null;
}

/** "/stages/1" -> "stages[1]" */
function fieldName(instancePath, extra) {
  const parts = instancePath.split('/').filter(Boolean);
  if (extra !== undefined) parts.push(extra);
  if (!parts.length) return '(listing)';
  return parts.reduce((acc, p) => (/^\d+$/.test(p) ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), '');
}

function lineOf(doc, lineCounter, instancePath, extra) {
  const keys = instancePath.split('/').filter(Boolean).map((k) => (/^\d+$/.test(k) ? Number(k) : k));
  // Walk down to the deepest node that exists so missing fields point at their parent.
  for (let n = keys.length; n >= 0; n--) {
    const node = n === 0 ? doc.contents : doc.getIn(keys.slice(0, n), true);
    if (node && node.range) {
      if (extra && node.items) {
        const pair = node.items.find((p) => p.key && p.key.value === extra);
        if (pair && pair.key.range) return lineCounter.linePos(pair.key.range[0]).line;
      }
      return lineCounter.linePos(node.range[0]).line;
    }
  }
  return 1;
}

function describe(err, taxonomy) {
  const field = fieldName(err.instancePath);
  const defName = (err.schemaPath.match(/#\/\$defs\/(\w+)\//) || [])[1];

  if (err.keyword === 'enum' && TAXONOMY_DEFS[defName]) {
    const allowed = taxonomy.ids[TAXONOMY_DEFS[defName]];
    const hint = suggest(err.data, allowed);
    return (
      `${field}: "${err.data}" is not a known ${defName}.` +
      (hint ? ` Did you mean "${hint}"?` : '') +
      ` Allowed values (from taxonomy.yaml): ${allowed.join(', ')}`
    );
  }
  switch (err.keyword) {
    case 'required':
      if (!err.instancePath && err.params.missingProperty === 'products') {
        return `products: required. Name which of our products this connector works with (${taxonomy.ids.product.join(', ')}). Connectors that don't work with our products are not accepted`;
      }
      return `${fieldName(err.instancePath, err.params.missingProperty)}: required field is missing`;
    case 'additionalProperties': {
      const known = Object.keys(err.parentSchema.properties || {});
      const hint = suggest(err.params.additionalProperty, known);
      return (
        `${fieldName(err.instancePath, err.params.additionalProperty)}: unknown field.` +
        (hint ? ` Did you mean "${hint}"?` : '') +
        ` Allowed here: ${known.join(', ')}`
      );
    }
    case 'anyOf':
      return `${field}: ${ANY_OF_HINTS[err.instancePath] || 'does not match any allowed shape'}`;
    case 'pattern':
      if (err.parentSchema.pattern?.startsWith('^https://')) return `${field}: must be an https:// URL (got "${err.data}")`;
      if (err.instancePath === '/id') return `id: "${err.data}" must be lowercase kebab-case, e.g. "acme-test-runner"`;
      if (err.instancePath === '/logo' || err.instancePath === '/vendor/logo') return `${field}: "${err.data}" must look like logos/<name>.svg or logos/<name>.png`;
      return `${field}: "${err.data}" has an invalid format (expected pattern ${err.params.pattern})`;
    case 'format':
      return `${field}: "${err.data}" is not a valid ${err.params.format}`;
    case 'type':
      return `${field}: must be ${err.params.type === 'array' ? 'a list' : `a ${err.params.type}`}`;
    case 'minItems':
      if (err.instancePath === '/products') {
        return `products: list at least one of our products this connector works with (${taxonomy.ids.product.join(', ')}). Connectors that don't work with our products are not accepted`;
      }
      return `${field}: needs at least ${err.params.limit} item(s)`;
    case 'uniqueItems':
      return `${field}: contains a duplicate value`;
    case 'minLength':
      return `${field}: too short (min ${err.params.limit} characters)`;
    case 'maxLength':
      return `${field}: too long (max ${err.params.limit} characters)`;
    default:
      return `${field}: ${err.message}`;
  }
}

/** Drop ajv noise: errors inside an anyOf branch are summarised by the anyOf error itself. */
function prune(errors) {
  return errors.filter((e) => !/\/anyOf\/\d+\//.test(e.schemaPath));
}

/**
 * Checks that JSON Schema cannot express: file name, cross-listing uniqueness,
 * files on disk, and taxonomy-driven rules (badge requirements, protocol/install pairing).
 */
function semanticChecks(listing, file, ctx) {
  const out = [];
  const add = (field, message, at = field) => out.push({ at, message: `${field}: ${message}` });
  const base = path.basename(file).replace(/\.ya?ml$/, '');

  if (listing.id && listing.id !== base) add('id', `"${listing.id}" must match the file name "${base}.yaml"`);

  if (listing.logo && !fs.existsSync(path.join(ctx.root, listing.logo))) {
    add('logo', `file "${listing.logo}" does not exist. Add it to the logos/ folder in the same PR`);
  }
  const vendorLogo = listing.vendor?.logo;
  if (typeof vendorLogo === 'string' && !fs.existsSync(path.join(ctx.root, vendorLogo))) {
    add('vendor.logo', `file "${vendorLogo}" does not exist. Add it to the logos/ folder in the same PR`);
  }

  const badge = ctx.taxonomy.badges.find((b) => b.id === listing.badge);
  if (badge) {
    for (const req of badge.requires || []) {
      if (listing[req] === undefined) add(req, `required for the "${badge.id}" badge`, 'badge');
    }
    if (listing.install?.url) {
      for (const req of badge.requires_if_remote || []) {
        if (listing[req] === undefined) add(req, `required for the "${badge.id}" badge on a remote connector`, 'badge');
      }
    }
    if (badge.verified_registry && listing.id && !ctx.verifiedIds.has(listing.id)) {
      const open = ctx.taxonomy.badges.filter((b) => !b.verified_registry).map((b) => `"${b.id}"`);
      add('badge', `"${badge.id}" can only be set by maintainers: "${listing.id}" is not in VERIFIED.md. Use ${open.join(' or ')} instead`);
    }
  }

  for (const proto of listing.protocols || []) {
    const def = ctx.taxonomy.protocols.find((p) => p.id === proto);
    const need = def && def.install_requires;
    if (need && listing.install && listing.install[need] === undefined) {
      add(`install.${need}`, `required because protocols include "${proto}"`, 'install');
    }
  }
  return out;
}

/**
 * Validate listing files. Returns { listings, results } where each result is
 * { file, ok, errors: [{ line, message }] }.
 */
function validateFiles(files, opts = {}) {
  const root = opts.root || ROOT;
  const taxonomy = opts.taxonomy || loadTaxonomy();
  const validate = compile(taxonomy);
  const verifiedIds = opts.verifiedIds || loadVerifiedIds(path.join(root, 'VERIFIED.md'));
  const ctx = { root, taxonomy, verifiedIds };

  const results = [];
  const listings = [];
  const seenIds = new Map();

  for (const file of files) {
    const rel = path.relative(root, path.resolve(file)) || file;
    const src = fs.readFileSync(file, 'utf8');
    const lineCounter = new YAML.LineCounter();
    const doc = YAML.parseDocument(src, { lineCounter, prettyErrors: false });
    const errors = [];

    if (doc.errors.length) {
      for (const e of doc.errors) {
        errors.push({ line: e.linePos?.[0]?.line || 1, message: `YAML syntax error: ${e.message.split('\n')[0]}` });
      }
      results.push({ file: rel, ok: false, errors });
      continue;
    }

    const listing = doc.toJS();
    if (!listing || typeof listing !== 'object' || Array.isArray(listing)) {
      results.push({ file: rel, ok: false, errors: [{ line: 1, message: 'file must contain a single YAML mapping (key: value pairs)' }] });
      continue;
    }

    if (!validate(listing)) {
      for (const err of prune(validate.errors)) {
        const extra = err.keyword === 'required' ? undefined : err.params.additionalProperty;
        errors.push({ line: lineOf(doc, lineCounter, err.instancePath, extra), message: describe(err, taxonomy) });
      }
    }
    for (const e of semanticChecks(listing, file, ctx)) {
      errors.push({ line: lineOf(doc, lineCounter, `/${e.at}`), message: e.message });
    }

    if (listing.id) {
      if (seenIds.has(listing.id)) {
        errors.push({ line: lineOf(doc, lineCounter, '/id'), message: `id: "${listing.id}" is already used by ${seenIds.get(listing.id)}` });
      } else {
        seenIds.set(listing.id, rel);
      }
    }

    // Stable, de-duplicated, line-ordered output.
    const unique = [...new Map(errors.map((e) => [`${e.line}:${e.message}`, e])).values()].sort((a, b) => a.line - b.line);
    results.push({ file: rel, ok: unique.length === 0, errors: unique });
    if (!unique.length) listings.push(listing);
  }

  return { listings, results, taxonomy };
}

function listingFiles(dir = path.join(ROOT, 'listings')) {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

function formatResults(results, { color = process.stdout.isTTY, github = !!process.env.GITHUB_ACTIONS } = {}) {
  const red = (s) => (color ? `\x1b[31m${s}\x1b[0m` : s);
  const green = (s) => (color ? `\x1b[32m${s}\x1b[0m` : s);
  const lines = [];
  for (const r of results) {
    if (r.ok) {
      lines.push(`${green('✔')} ${r.file}`);
      continue;
    }
    lines.push(`${red('✖')} ${r.file}  (${r.errors.length} problem${r.errors.length > 1 ? 's' : ''})`);
    for (const e of r.errors) {
      lines.push(`    ${r.file}:${e.line}  ${e.message}`);
      if (github) lines.push(`::error file=${r.file},line=${e.line}::${e.message.replace(/\n/g, ' ')}`);
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  lines.push('');
  lines.push(failed ? red(`${failed} of ${results.length} listing(s) failed validation`) : green(`All ${results.length} listing(s) valid`));
  return lines.join('\n');
}

module.exports = { validateFiles, listingFiles, formatResults, loadVerifiedIds, buildSchema };
