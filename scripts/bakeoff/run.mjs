/**
 * Model bake-off runner — ClickUp task 86d3ymaw7.
 *
 * Runs each test set through each candidate model using the PRODUCTION prompts
 * (imported from lib/, never pasted), scores raw output against the mechanical
 * rules in rules.mjs, and writes a side-by-side report for the human/Claude
 * scoring pass against Kunj's ideal results.
 *
 * Usage:
 *   export OPENROUTER_API_KEY=sk-or-v1-...
 *   node --import ./scripts/proof/_register.mjs scripts/bakeoff/run.mjs
 *
 * Flags:
 *   --types carousel,reel,storytelling,ideas   (default: all)
 *   --models a,b,c                             (default: registry DEFAULT_MODELS)
 *   --sets path/to/dir-or-file.json            (default: scripts/bakeoff/testsets)
 *   --runs 3                                   repeat each cell N times (default 1).
 *                                              Production temps are 0.7–0.85, so a
 *                                              single sample is noisy; use 3 to judge
 *                                              consistency rather than one lucky roll.
 *   --out scripts/bakeoff/out                  (default)
 *   --dry-run                                  build prompts + write them out, call nothing
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DEFAULT_MODELS, GENERATION_TYPES, TYPE_IDS } from './registry.mjs';
import { complete, extractJson, fetchCost, requireKey } from './openrouter.mjs';
import { score } from './rules.mjs';
import { renderReport } from './report.mjs';

function parseArgs(argv) {
  const args = { runs: 1, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const value = argv[i + 1];
      i += 1;
      if (key === 'types') args.types = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'models') args.models = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'sets') args.sets = value;
      else if (key === 'runs') args.runs = Math.max(1, Number(value) || 1);
      else if (key === 'out') args.out = value;
    }
  }
  return args;
}

function loadTestSets(pathArg) {
  const target = resolve(process.cwd(), pathArg ?? 'scripts/bakeoff/testsets');
  let files = [];
  if (statSync(target).isDirectory()) {
    files = readdirSync(target)
      .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
      .map((f) => join(target, f));
  } else {
    files = [target];
  }

  const sets = files.map((file) => {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed.id) throw new Error(`${file}: missing "id"`);
    if (!parsed.braindump && !parsed.ideasSignals) {
      throw new Error(`${file}: needs "braindump" (carousel/reel/storytelling) or "ideasSignals" (ideas)`);
    }
    return { ...parsed, __file: file };
  });

  if (sets.length === 0) {
    throw new Error(
      `No test sets found in ${target}.\n` +
        '  Each test set is one JSON file: raw braindump + Kunj\'s ideal result + the rules he applied.\n' +
        '  See scripts/bakeoff/testsets/README.md and _TEMPLATE.json.',
    );
  }
  return sets;
}

function slug(s) {
  return String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const types = (args.types ?? TYPE_IDS).filter((t) => {
    if (!GENERATION_TYPES[t]) {
      console.warn(`! unknown generation type "${t}" — skipping. Known: ${TYPE_IDS.join(', ')}`);
      return false;
    }
    return true;
  });
  const models = args.models ?? DEFAULT_MODELS;
  const sets = loadTestSets(args.sets);
  const key = args.dryRun ? null : requireKey();

  const outRoot = resolve(process.cwd(), args.out ?? 'scripts/bakeoff/out');
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outDir = join(outRoot, runId);
  mkdirSync(join(outDir, 'raw'), { recursive: true });

  const cells = [];
  for (const set of sets) {
    for (const typeId of types) {
      // A set that only carries ideasSignals cannot drive braindump types.
      if (typeId !== 'ideas' && !set.braindump) continue;
      for (const model of models) {
        for (let attempt = 1; attempt <= args.runs; attempt += 1) {
          cells.push({ set, typeId, model, attempt });
        }
      }
    }
  }

  console.log(
    `Bake-off ${runId}\n` +
      `  sets:   ${sets.map((s) => s.id).join(', ')}\n` +
      `  types:  ${types.join(', ')}\n` +
      `  models: ${models.join(', ')}\n` +
      `  runs:   ${args.runs} → ${cells.length} generations\n` +
      (args.dryRun ? '  MODE:   dry run (no API calls)\n' : ''),
  );

  const records = [];
  let done = 0;

  for (const cell of cells) {
    const spec = GENERATION_TYPES[cell.typeId];
    const messages = spec.buildMessages(cell.set);
    done += 1;
    const tag = `${cell.set.id} / ${cell.typeId} / ${cell.model}${args.runs > 1 ? ` #${cell.attempt}` : ''}`;

    if (args.dryRun) {
      console.log(`[${done}/${cells.length}] (dry) ${tag}`);
      records.push({ ...cell, set: cell.set.id, messages, dryRun: true });
      continue;
    }

    process.stdout.write(`[${done}/${cells.length}] ${tag} … `);

    const res = await complete({
      key,
      model: cell.model,
      messages,
      temperature: spec.temperature,
      maxTokens: spec.maxTokens,
    });

    if (!res.ok) {
      console.log(`FAILED (${res.error.slice(0, 80)})`);
      records.push({
        set: cell.set.id, typeId: cell.typeId, model: cell.model, attempt: cell.attempt,
        ok: false, error: res.error, latencyMs: res.latencyMs,
      });
      continue;
    }

    const { parsed, fenced, error: parseError } = extractJson(res.text);
    const checked = parsed ? spec.check(parsed) : { results: [], metrics: {} };
    const scored = parsed ? score(checked.results) : { passed: 0, total: 0, pct: 0 };

    let normalized = null;
    if (parsed && spec.normalize) {
      try {
        normalized = spec.normalize(parsed);
      } catch (e) {
        normalized = { __normalizeError: String(e) };
      }
    }

    const cost = await fetchCost(key, res.generationId);

    const record = {
      set: cell.set.id,
      typeId: cell.typeId,
      model: cell.model,
      attempt: cell.attempt,
      ok: true,
      parseError,
      fenced,
      jsonModeRejected: res.jsonModeRejected,
      finishReason: res.finishReason,
      latencyMs: res.latencyMs,
      usage: res.usage,
      cost,
      scored,
      metrics: checked.metrics,
      results: checked.results,
    };
    records.push(record);

    const file = `${slug(cell.set.id)}__${cell.typeId}__${slug(cell.model)}__${cell.attempt}.json`;
    writeFileSync(
      join(outDir, 'raw', file),
      JSON.stringify({ ...record, messages, rawText: res.text, parsed, normalized }, null, 2),
      'utf8',
    );

    const flags = [
      parseError ? `PARSE:${parseError}` : null,
      fenced ? 'fenced' : null,
      res.jsonModeRejected ? 'no-json-mode' : null,
      res.finishReason === 'length' ? 'TRUNCATED' : null,
    ].filter(Boolean);
    console.log(
      `${scored.pct}% rules (${scored.passed}/${scored.total}) · ${res.latencyMs}ms` +
        (cost != null ? ` · $${cost.toFixed(5)}` : '') +
        (flags.length ? ` · ${flags.join(' ')}` : ''),
    );
  }

  const summary = { runId, types, models, sets: sets.map((s) => s.id), runs: args.runs, records };
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  if (!args.dryRun) {
    writeFileSync(join(outDir, 'report.md'), renderReport(summary, sets, GENERATION_TYPES, outDir), 'utf8');
    console.log(`\nReport:  ${join(outDir, 'report.md')}`);
  }
  console.log(`Raw:     ${join(outDir, 'raw')}`);
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
