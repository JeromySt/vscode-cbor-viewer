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

async function fetchJson(url) {
  const token = requiredEnv('GITHUB_TOKEN');
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
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

  const blockLines = [
    startMarker,
    ...(sourceNote ? [`_Source: ${sourceNote}_`, ''] : []),
    ...bullets.map(b => `- ${b}`),
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
  let updatedBody = unreleasedBody;

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
  const prNumber = Number(requiredEnv('PR_NUMBER'));
  const baseSha = requiredEnv('PR_BASE_SHA');
  const headSha = requiredEnv('PR_HEAD_SHA');
  const repo = requiredEnv('REPO');

  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid REPO env var: ${repo}`);
  }

  let sourceNote = '';
  let bullets;

  // 1) Try to find a Copilot-authored summary comment in the PR conversation.
  try {
    const commentsUrl = `https://api.github.com/repos/${owner}/${name}/issues/${prNumber}/comments?per_page=100`;
    const comments = await fetchJson(commentsUrl);

    const copilotComments = (Array.isArray(comments) ? comments : [])
      .filter(c => c && c.user && typeof c.user.login === 'string')
      .filter(c => /copilot/i.test(c.user.login))
      .filter(c => typeof c.body === 'string' && c.body.trim().length > 0);

    const latest = copilotComments.at(-1);
    const extracted = latest ? extractCopilotSummary(latest.body) : undefined;

    if (extracted) {
      bullets = bulletsFromText(extracted);
      sourceNote = `Copilot PR summary (${latest.user.login})`;
    }
  } catch {
    // best-effort
  }

  // 2) Fallback to a diff-based summary.
  if (!bullets || bullets.length === 0) {
    bullets = diffSummary(baseSha, headSha);
    sourceNote = 'Auto-generated from git diff (Copilot summary not found)';
  }

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
