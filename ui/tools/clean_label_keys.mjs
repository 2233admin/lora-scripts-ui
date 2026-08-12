/**
 * P3: strip trailing fullwidth （snake_case_key） from schema labels.
 * Keeps parentheses with Chinese / spaces / non-snake content.
 * If the same line has label but no title, inject title: '<field.key>'.
 *
 * Dual tree roots (paths relative to each root):
 *   legacy: plugin/lora-scripts-ui-main/ui  → src/...
 *   next:   plugin/Lulynx-evolution-ui/ui     → src/schema/...
 *
 * Usage (from either ui/ or repo root — script resolves via import.meta.url):
 *   node tools/clean_label_keys.mjs           # dry-run
 *   node tools/clean_label_keys.mjs --write   # write
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const KEY_SUFFIX = /（[a-z][a-z0-9_]*）(?=\s*['"`])/g;
const FIELD_KEY = /\bkey:\s*['"`]([^'"`]+)['"`]/;

const HERE = dirname(fileURLToPath(import.meta.url));
// tools/ → ui/
const LEGACY_UI = join(HERE, '..');
// tools/ → ui/ → Lulynx-evolution-ui sibling via plugin/
const NEXT_UI = join(HERE, '..', '..', '..', 'Lulynx-evolution-ui', 'ui');

const LEGACY_REL = [
  'src/schemaFieldGroups.js',
  'src/animaSchema.js',
  'src/sdxlSchema.js',
  'src/otherDitSchemas.js',
  'src/schemaCommon.js',
  'src/experimentalTrainingSchemas.js',
  'src/otherSchemas.js',
  'src/schemaFrontierGroups.js',
  'src/features/settingsOptions.js',
  'src/conceptEditUnifiedSchema.js',
];

const NEXT_REL = [
  'src/schema/schemaFieldGroups.js',
  'src/schema/animaSchema.js',
  'src/schema/sdxlSchema.js',
  'src/schema/otherDitSchemas.js',
  'src/schema/schemaCommon.js',
  'src/schema/experimentalTrainingSchemas.js',
  'src/schema/otherSchemas.js',
  'src/schema/schemaFrontierGroups.js',
  'src/schema/features/settingsOptions.js',
  'src/schema/conceptEditUnifiedSchema.js',
];

const write = process.argv.includes('--write');
let totalChanged = 0;
let totalFiles = 0;

function cleanFile(absPath, label) {
  if (!existsSync(absPath)) {
    console.log(`SKIP missing ${label}`);
    return;
  }
  const src = readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  let changed = 0;

  const result = lines.map((line) => {
    KEY_SUFFIX.lastIndex = 0;
    if (!KEY_SUFFIX.test(line)) return line;
    KEY_SUFFIX.lastIndex = 0;

    let out = line.replace(KEY_SUFFIX, '');

    const hasLabel = /\blabel:/.test(out);
    const hasTitle = /\btitle:/.test(out);
    if (hasLabel && !hasTitle) {
      const keyMatch = out.match(FIELD_KEY);
      if (keyMatch) {
        out = out.replace(
          /(label:\s*['"`][^'"`]*['"`])/,
          `$1, title: '${keyMatch[1]}'`,
        );
      }
    }

    changed += 1;
    return out;
  });

  totalChanged += changed;
  totalFiles += 1;
  console.log(`${label}: ${changed} lines`);

  if (write && changed > 0) {
    writeFileSync(absPath, result.join('\n'), 'utf8');
    console.log('  → written');
  }
}

console.log('=== legacy ===');
for (const rel of LEGACY_REL) {
  cleanFile(join(LEGACY_UI, rel), `legacy/${rel}`);
}

console.log('=== next ===');
for (const rel of NEXT_REL) {
  cleanFile(join(NEXT_UI, rel), `next/${rel}`);
}

console.log(
  `\nfiles=${totalFiles} lines_with_suffix=${totalChanged}${write ? ' (written)' : ' (dry-run, pass --write)'}`,
);
