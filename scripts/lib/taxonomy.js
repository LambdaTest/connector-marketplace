'use strict';

const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * Load taxonomy.yaml and flatten it into lookup-friendly lists.
 * Every category value used anywhere in the repo comes from here.
 */
function loadTaxonomy(file = path.join(ROOT, 'taxonomy.yaml')) {
  const raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];

  const stageGroups = Object.entries(raw.stages || {}).map(([groupId, group]) => ({
    id: groupId,
    label: group.label,
    values: (group.values || []).map((v) => ({ ...v, group: groupId })),
  }));
  const stages = stageGroups.flatMap((g) => g.values);
  const products = raw.products || [];
  const types = raw.types || [];
  const protocols = raw.protocols || [];
  const badges = raw.badges || [];

  // Guard against a broken taxonomy: duplicate ids would make enums ambiguous.
  for (const [name, list] of Object.entries({ products, stages, types, protocols, badges })) {
    if (list.length === 0) problems.push(`taxonomy.yaml: "${name}" is empty`);
    const seen = new Set();
    for (const item of list) {
      if (!item.id) problems.push(`taxonomy.yaml: an entry in "${name}" has no id`);
      if (seen.has(item.id)) problems.push(`taxonomy.yaml: duplicate id "${item.id}" in "${name}"`);
      seen.add(item.id);
    }
  }
  if (problems.length) {
    const err = new Error(problems.join('\n'));
    err.taxonomyProblems = problems;
    throw err;
  }

  return {
    version: raw.version,
    stageGroups,
    products,
    stages,
    types,
    protocols,
    badges,
    ids: {
      product: products.map((p) => p.id),
      stage: stages.map((s) => s.id),
      type: types.map((t) => t.id),
      protocol: protocols.map((p) => p.id),
      badge: badges.map((b) => b.id),
    },
  };
}

module.exports = { loadTaxonomy, ROOT };
