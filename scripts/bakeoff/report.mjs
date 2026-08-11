/**
 * Renders the bake-off scoring sheet.
 *
 * The report deliberately stops short of naming a winner. Rule compliance is
 * mechanical and lives here; "closest to Kunj's ideal" is a judgement call that
 * task 86d3ymaw7 assigns to the Claude planning instance reading this file
 * alongside the ideal results. The scorecard narrows the field and supplies the
 * drift list; the human pass picks the winner.
 */

function avg(nums) {
  const list = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

function money(n) {
  if (n == null) return '—';
  return `$${n.toFixed(5)}`;
}

function ms(n) {
  return n == null ? '—' : `${Math.round(n)}ms`;
}

export function renderReport(summary, sets, GENERATION_TYPES, outDir) {
  const { runId, models, types, runs, records } = summary;
  const lines = [];

  lines.push(`# Model bake-off — ${runId}`);
  lines.push('');
  lines.push('ClickUp [`86d3ymaw7`](https://app.clickup.com/t/86d3ymaw7). Prompts imported live from `lib/` — see `AI_AUDIT.md`.');
  lines.push('');
  lines.push(`- **Models:** ${models.map((m) => `\`${m}\``).join(', ')}`);
  lines.push(`- **Types:** ${types.join(', ')}`);
  lines.push(`- **Test sets:** ${summary.sets.join(', ')}`);
  lines.push(`- **Samples per cell:** ${runs}`);
  lines.push('');
  lines.push('> Rule scores are computed on **raw** model output, before the app\'s normalizers.');
  lines.push('> The normalizers repair most violations silently, so scoring normalized output');
  lines.push('> would score the normalizer rather than the model. See `AI_AUDIT.md`.');
  lines.push('');

  // ── Headline: rule compliance per type × model
  lines.push('## 1. Rule compliance');
  lines.push('');
  lines.push('Percentage of mechanical prompt rules the raw output satisfied, averaged across test sets and samples.');
  lines.push('');
  lines.push(`| Generation type | ${models.map((m) => `\`${m}\``).join(' | ')} |`);
  lines.push(`|---|${models.map(() => '---').join('|')}|`);

  for (const typeId of types) {
    const cells = models.map((model) => {
      const rows = records.filter((r) => r.typeId === typeId && r.model === model && r.ok);
      if (rows.length === 0) return '—';
      const pct = avg(rows.map((r) => r.scored.pct));
      const failures = rows.filter((r) => r.scored.pct < 100).length;
      return `**${Math.round(pct)}%**${runs > 1 ? ` (${rows.length - failures}/${rows.length} clean)` : ''}`;
    });
    lines.push(`| ${GENERATION_TYPES[typeId]?.label ?? typeId} | ${cells.join(' | ')} |`);
  }
  lines.push('');

  // ── Cost + latency
  lines.push('## 2. Cost and latency');
  lines.push('');
  lines.push('| Model | Avg cost / call | Avg latency | Total cost | Errors |');
  lines.push('|---|---|---|---|---|');
  for (const model of models) {
    const rows = records.filter((r) => r.model === model);
    const okRows = rows.filter((r) => r.ok);
    const costs = okRows.map((r) => r.cost).filter((c) => c != null);
    const total = costs.length ? costs.reduce((a, b) => a + b, 0) : null;
    lines.push(
      `| \`${model}\` | ${money(avg(costs))} | ${ms(avg(okRows.map((r) => r.latencyMs)))} | ${money(total)} | ${rows.length - okRows.length} |`,
    );
  }
  lines.push('');
  lines.push('Costs come from OpenRouter\'s generation endpoint and settle asynchronously; a `—` means it had not settled when the run finished, not that the call was free.');
  lines.push('');

  // ── Drift: which rules each model broke
  lines.push('## 3. Drift — which rules each model broke');
  lines.push('');
  lines.push('This is the prompt-refinement spec. A rule that every model breaks is a prompt problem, not a model problem.');
  lines.push('');

  for (const typeId of types) {
    const typeRows = records.filter((r) => r.typeId === typeId && r.ok);
    if (typeRows.length === 0) continue;
    lines.push(`### ${GENERATION_TYPES[typeId]?.label ?? typeId}`);
    lines.push('');

    const ruleIds = [];
    for (const r of typeRows) {
      for (const res of r.results) if (!ruleIds.includes(res.id)) ruleIds.push(res.id);
    }

    const broken = ruleIds.filter((id) => typeRows.some((r) => r.results.some((res) => res.id === id && !res.ok)));

    if (broken.length === 0) {
      lines.push('Every model satisfied every mechanical rule. Differences here are voice-only — decide on the ideal-result comparison.');
      lines.push('');
      continue;
    }

    lines.push(`| Rule | ${models.map((m) => `\`${m.split('/').pop()}\``).join(' | ')} |`);
    lines.push(`|---|${models.map(() => '---').join('|')}|`);
    for (const id of broken) {
      const label = typeRows.flatMap((r) => r.results).find((res) => res.id === id)?.label ?? id;
      const cells = models.map((model) => {
        const rows = typeRows.filter((r) => r.model === model);
        if (rows.length === 0) return '—';
        const failed = rows.filter((r) => r.results.some((res) => res.id === id && !res.ok));
        if (failed.length === 0) return 'ok';
        const detail = failed[0].results.find((res) => res.id === id)?.detail;
        return `**broke** ${runs > 1 ? `(${failed.length}/${rows.length}) ` : ''}${detail ? `— ${detail}` : ''}`;
      });
      lines.push(`| ${label} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  // ── Operational flags
  const flagged = records.filter(
    (r) => r.ok && (r.parseError || r.fenced || r.jsonModeRejected || r.finishReason === 'length'),
  );
  if (flagged.length > 0) {
    lines.push('## 4. Operational flags');
    lines.push('');
    lines.push('Integration-level problems, separate from content quality. A model that needs fence-stripping or rejects JSON mode costs real work to adopt.');
    lines.push('');
    lines.push('| Set | Type | Model | Flag |');
    lines.push('|---|---|---|---|');
    for (const r of flagged) {
      const flags = [
        r.parseError ? `parse failed: ${r.parseError}` : null,
        r.fenced ? 'wrapped JSON in markdown fences' : null,
        r.jsonModeRejected ? 'rejected response_format=json_object' : null,
        r.finishReason === 'length' ? 'output truncated (hit max_tokens)' : null,
      ].filter(Boolean);
      lines.push(`| ${r.set} | ${r.typeId} | \`${r.model}\` | ${flags.join('; ')} |`);
    }
    lines.push('');
  }

  const errored = records.filter((r) => !r.ok && !r.dryRun);
  if (errored.length > 0) {
    lines.push('## 5. Failed calls');
    lines.push('');
    lines.push('| Set | Type | Model | Error |');
    lines.push('|---|---|---|---|');
    for (const r of errored) {
      lines.push(`| ${r.set} | ${r.typeId} | \`${r.model}\` | ${String(r.error).replace(/\|/g, '\\|').slice(0, 200)} |`);
    }
    lines.push('');
  }

  // ── The human pass
  lines.push('## 6. Scoring against the ideal results — fill this in');
  lines.push('');
  lines.push('The mechanical pass above cannot judge voice, hook quality, or whether the turn actually lands.');
  lines.push('Read each model\'s output in `raw/` next to the ideal result in the test set, and record the drift.');
  lines.push('');

  for (const typeId of types) {
    lines.push(`### ${GENERATION_TYPES[typeId]?.label ?? typeId}`);
    lines.push('');
    lines.push('| Model | Closeness to ideal (1–5) | How it drifted |');
    lines.push('|---|---|---|');
    for (const model of models) lines.push(`| \`${model}\` | | |`);
    lines.push('');
    lines.push('**Winner:** _____  — **because:** _____');
    lines.push('');
  }

  // ── Reference: the ideals + rules, inline so scoring needs one file open
  lines.push('## 7. Reference — the ideal results and rules');
  lines.push('');
  for (const set of sets) {
    lines.push(`### Test set: ${set.label ?? set.id}`);
    lines.push('');
    if (set.braindump) {
      lines.push('<details><summary>Raw braindump</summary>');
      lines.push('');
      lines.push('```');
      lines.push(set.braindump);
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
    if (Array.isArray(set.rules) && set.rules.length) {
      lines.push('**Rules Kunj applied:**');
      lines.push('');
      for (const rule of set.rules) lines.push(`- ${rule}`);
      lines.push('');
    }
    if (set.ideal && typeof set.ideal === 'object') {
      for (const [typeId, ideal] of Object.entries(set.ideal)) {
        lines.push(`<details><summary>Ideal result — ${typeId}</summary>`);
        lines.push('');
        lines.push('```');
        lines.push(typeof ideal === 'string' ? ideal : JSON.stringify(ideal, null, 2));
        lines.push('```');
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`Raw outputs: \`${outDir}/raw/\``);
  lines.push('');

  return lines.join('\n');
}
