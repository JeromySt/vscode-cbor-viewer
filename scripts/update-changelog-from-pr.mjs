import fs from 'fs';
import { execFileSync } from 'child_process';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
}

function normalizeNewlines(s) {
  return String(s ?? '').replace(/\r\n/g, '\n');
}

function extractCopilotSummary(body) {
  const text = normalizeNewlines(body).trim();
  if (!text) return undefined;

  // Heuristics: prefer a "Summary" section if present, otherwise keep the first ~25 lines.
  const lines = text.split('\n');
  const summaryStart = lines.findIndex(l => /^\s*#{1,6}\s*summary\b/i.test(l) || /^\s*summary\b\s*:/i.test(l));
  if (summaryStart >= 0) {
    const rest = lines.slice(summaryStart + 1);
    const untilNextHeader = [];
    for (const line of rest) {
      if (/^\s*#{1,6}\s+/.test(line)) break;
      untilNextHeader.push(line);
    }
    const extracted = untilNextHeader.join('\n').trim();
    return extracted || undefined;
  }

  return lines.slice(0, 25).join('\n').trim();
}

function bulletsFromText(text) {
  const normalized = normalizeNewlines(text);
  const rawLines = normalized.split('\n').map(l => l.trim()).filter(Boolean);

  const bullets = [];
  for (const line of rawLines) {
    if (/^[-*+]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*+]\s+/, '').trim());
      continue;
    }
    // Handle "1. foo" style
    if (/^\d+\.\s+/.test(line)) {
      bullets.push(line.replace(/^\d+\.\s+/, '').trim());
      continue;
    }
  }

  if (bullets.length > 0) return bullets.slice(0, 12);

  // Fallback: treat non-empty lines as bullet candidates.
  return rawLines.slice(0, 8);
}

function stripMarkdownLinks(s) {
  const text = String(s ?? '');
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1');
}

function sanitizeChangelogLine(s, maxLen = 200) {
  const text = stripMarkdownLinks(String(s ?? ''))
    .replace(/[\r\n\0]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();

  if (!text) return undefined;
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function sanitizeBullets(bullets) {
  const out = [];
  for (const b of Array.isArray(bullets) ? bullets : []) {
    const line = sanitizeChangelogLine(b, 220);
    if (!line) continue;
    out.push(line);
  }
  return out.slice(0, 20);
}

function diffSummary(baseSha, headSha) {
  const nameStatus = runGit(['diff', '--name-status', `${baseSha}..${headSha}`]);
  const files = nameStatus
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => {
      const [status, ...rest] = l.split(/\s+/);
      return { status, path: rest.join(' ') };
    });

  const counts = {
    code: 0,
    tests: 0,
    docs: 0,
    ci: 0,
    other: 0
  };

  for (const f of files) {
    const p = f.path.replace(/\\/g, '/');
    if (p.startsWith('src/test/') || p.includes('/test/') || p.includes('.test.')) {
      counts.tests++;
    } else if (p === 'README.md' || p === 'CHANGELOG.md' || p.endsWith('.md')) {
      counts.docs++;
    } else if (p.startsWith('.github/workflows/')) {
      counts.ci++;
    } else if (p.startsWith('src/') || p.startsWith('media/')) {
      counts.code++;
    } else {
      counts.other++;
    }
  }

  const bullets = [];
  if (counts.code) bullets.push(`Code changes in ${counts.code} file(s)`);
  if (counts.tests) bullets.push(`Test updates in ${counts.tests} file(s)`);
  if (counts.docs) bullets.push(`Docs updates in ${counts.docs} file(s)`);
  if (counts.ci) bullets.push(`CI/workflow updates in ${counts.ci} file(s)`);
  if (counts.other) bullets.push(`Other changes in ${counts.other} file(s)`);

  // Add a few concrete file paths for context.
  const top = files.slice(0, 8).map(f => f.path.replace(/\\/g, '/'));
  if (top.length) bullets.push(`Touched: ${top.join(', ')}`);

  return bullets;
}

function upsertUnreleasedSection(changelogText, bullets, sourceNote) {
  const startMarker = '<!-- cbor-viewer:pr-summary:start -->';
  const endMarker = '<!-- cbor-viewer:pr-summary:end -->';

  const safeBullets = sanitizeBullets(bullets);
  const safeSourceNote = sanitizeChangelogLine(sourceNote, 120);

  const blockLines = [
    startMarker,
    ...(safeSourceNote ? [`_Source: ${safeSourceNote}_`, ''] : []),
    ...safeBullets.map(b => `- ${b}`),
    endMarker
  ];
  const block = blockLines.join('\n');

  const text = normalizeNewlines(changelogText);

  const unreleasedHeader = '## [Unreleased]';
  const hasUnreleased = text.includes(unreleasedHeader);

  let out = text;
  if (!hasUnreleased) {
    // Insert after the intro paragraph (after the first blank line following the "Change Log" header block).
    const lines = out.split('\n');
    let insertAt = lines.findIndex((l, i) => i > 0 && /^##\s+\[\d+\./.test(l));
    if (insertAt === -1) {
      insertAt = lines.length;
    }

    const unreleased = [
      unreleasedHeader,
      '',
      '### Changed',
      block,
      ''
    ].join('\n');

    lines.splice(insertAt, 0, unreleased);
    out = lines.join('\n');
  }

  // Ensure Unreleased has a Changed subsection.
  if (!/##\s+\[Unreleased\][\s\S]*?###\s+Changed/i.test(out)) {
    out = out.replace(
      /##\s+\[Unreleased\]\s*/i,
      `${unreleasedHeader}\n\n### Changed\n`
    );
  }

  // Replace or insert our marker block under Unreleased/Changed.
  const unreleasedMatch = out.match(/##\s+\[Unreleased\][\s\S]*?(?=\n##\s+\[|\s*$)/i);
  if (!unreleasedMatch) {
    return out;
  }

  const unreleasedBody = unreleasedMatch[0];
  let updatedBody;

  const markerRe = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (markerRe.test(unreleasedBody)) {
    updatedBody = unreleasedBody.replace(markerRe, block);
  } else {
    // Insert directly after "### Changed" line.
    updatedBody = unreleasedBody.replace(/(###\s+Changed\s*)/i, `$1\n${block}\n`);
  }

  return out.replace(unreleasedBody, updatedBody);
}

async function main() {
  // PR_NUMBER is optional here; it can be used by CI for logging.
  const prNumber = Number(process.env.PR_NUMBER || '');
  const baseSha = requiredEnv('PR_BASE_SHA');
  const headSha = requiredEnv('PR_HEAD_SHA');

  let sourceNote = '';
  let bullets;

  // 1) Prefer workflow-provided summary text (e.g., Copilot comment fetched by GitHub Actions).
  // Keeping the HTTP fetch in workflow avoids CodeQL http-to-file-access findings in this script.
  const workflowSummary = (process.env.COPILOT_PR_SUMMARY || '').trim();
  const workflowSource = (process.env.COPILOT_PR_SUMMARY_SOURCE || '').trim();
  if (workflowSummary) {
    const extracted = extractCopilotSummary(workflowSummary);
    if (extracted) {
      bullets = bulletsFromText(extracted);
      sourceNote = workflowSource || (Number.isFinite(prNumber) ? `PR summary (workflow provided, PR #${prNumber})` : 'PR summary (workflow provided)');
    }
  }

  // 2) Fallback to a diff-based summary.
  if (!bullets || bullets.length === 0) {
    bullets = diffSummary(baseSha, headSha);
    sourceNote = 'Auto-generated from git diff (Copilot summary not found)';
  }

  bullets = sanitizeBullets(bullets);
  sourceNote = sanitizeChangelogLine(sourceNote, 120) || '';

  const changelogPath = 'CHANGELOG.md';
  const original = fs.readFileSync(changelogPath, 'utf8');
  const updated = upsertUnreleasedSection(original, bullets, sourceNote);

  if (normalizeNewlines(updated) !== normalizeNewlines(original)) {
    fs.writeFileSync(changelogPath, updated, 'utf8');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
