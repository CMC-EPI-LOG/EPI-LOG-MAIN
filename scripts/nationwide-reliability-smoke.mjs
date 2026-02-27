#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4012',
    fixture: 'scripts/fixtures/nationwide-stations.sample.json',
    outDir: 'output/nationwide-reliability',
    maxDegradedRatio: 0.2,
    timeoutMs: 15000,
    enforce: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--enforce') {
      args.enforce = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value) continue;

    if (token === '--base-url') {
      args.baseUrl = value;
      i += 1;
    } else if (token === '--fixture') {
      args.fixture = value;
      i += 1;
    } else if (token === '--out-dir') {
      args.outDir = value;
      i += 1;
    } else if (token === '--max-degraded-ratio') {
      args.maxDegradedRatio = Number(value);
      i += 1;
    } else if (token === '--timeout-ms') {
      args.timeoutMs = Number(value);
      i += 1;
    }
  }

  return args;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function toPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function mapStatus(value) {
  if (value === 'LIVE' || value === 'STATION_FALLBACK' || value === 'DEGRADED') {
    return value;
  }
  return 'REQUEST_FAILED';
}

function isSidoMismatch(expectedSido, resolvedSido) {
  if (!expectedSido || !resolvedSido) return false;
  return expectedSido !== resolvedSido;
}

function createMarkdown(results, summary) {
  const lines = [
    '# Nationwide Reliability Smoke Report',
    '',
    `- generatedAt: ${summary.generatedAt}`,
    `- baseUrl: ${summary.baseUrl}`,
    `- fixture: ${summary.fixture}`,
    `- total: ${summary.total}`,
    `- degradedRatio: ${toPercent(summary.degradedRatio)}`,
    `- crossSidoMismatchCount: ${summary.crossSidoMismatchCount}`,
    '',
    '| requestedStation | expectedSido | status | resolvedStation | resolvedSido | dataTime | triedStations | crossSidoMismatch |',
    '|---|---|---|---|---|---|---:|---|',
  ];

  for (const row of results) {
    lines.push(
      `| ${row.requestedStation} | ${row.expectedSido || ''} | ${row.status} | ${row.resolvedStation || ''} | ${row.resolvedSido || ''} | ${row.dataTime || ''} | ${row.triedCount} | ${row.crossSidoMismatch ? 'Y' : 'N'} |`,
    );
  }

  lines.push('');
  lines.push('## Status Counts');
  for (const [status, count] of Object.entries(summary.statusCounts)) {
    lines.push(`- ${status}: ${count}`);
  }

  return lines.join('\n');
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!Number.isFinite(args.maxDegradedRatio) || args.maxDegradedRatio < 0 || args.maxDegradedRatio > 1) {
    throw new Error(`Invalid --max-degraded-ratio: ${args.maxDegradedRatio}`);
  }

  const fixtureRaw = await readFile(args.fixture, 'utf8');
  const stations = JSON.parse(fixtureRaw);
  if (!Array.isArray(stations) || stations.length === 0) {
    throw new Error(`Fixture must be a non-empty array: ${args.fixture}`);
  }

  const results = [];
  for (const entry of stations) {
    const requestedStation = typeof entry?.requestedStation === 'string' ? entry.requestedStation : '';
    const expectedSido = typeof entry?.expectedSido === 'string' ? entry.expectedSido : null;

    if (!requestedStation) {
      results.push({
        requestedStation: '(invalid fixture row)',
        expectedSido,
        status: 'REQUEST_FAILED',
        resolvedStation: null,
        resolvedSido: null,
        dataTime: null,
        triedCount: 0,
        crossSidoMismatch: false,
        error: 'missing requestedStation',
      });
      continue;
    }

    const url = `${args.baseUrl}/api/air-quality-latest?stationName=${encodeURIComponent(requestedStation)}`;
    try {
      const response = await fetchWithTimeout(url, args.timeoutMs);
      if (!response.ok) {
        results.push({
          requestedStation,
          expectedSido,
          status: 'REQUEST_FAILED',
          resolvedStation: null,
          resolvedSido: null,
          dataTime: null,
          triedCount: 0,
          crossSidoMismatch: false,
          error: `http_${response.status}`,
        });
        continue;
      }

      const payload = await response.json();
      const reliability = payload?.reliability || {};
      const air = payload?.airQuality || {};
      const status = mapStatus(reliability?.status);
      const resolvedSido = typeof air?.sidoName === 'string' ? air.sidoName : null;
      const row = {
        requestedStation,
        expectedSido,
        status,
        resolvedStation: typeof reliability?.resolvedStation === 'string' ? reliability.resolvedStation : null,
        resolvedSido,
        dataTime: typeof air?.dataTime === 'string' ? air.dataTime : null,
        triedCount: Array.isArray(reliability?.triedStations) ? reliability.triedStations.length : 0,
        crossSidoMismatch: isSidoMismatch(expectedSido, resolvedSido),
      };
      results.push(row);
    } catch (error) {
      results.push({
        requestedStation,
        expectedSido,
        status: 'REQUEST_FAILED',
        resolvedStation: null,
        resolvedSido: null,
        dataTime: null,
        triedCount: 0,
        crossSidoMismatch: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const statusCounts = results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const degradedCount = results.filter((row) => row.status === 'DEGRADED').length;
  const crossSidoMismatchCount = results.filter((row) => row.crossSidoMismatch).length;
  const degradedRatio = results.length > 0 ? degradedCount / results.length : 0;

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    fixture: args.fixture,
    total: results.length,
    degradedCount,
    degradedRatio,
    crossSidoMismatchCount,
    statusCounts,
    enforce: args.enforce,
    maxDegradedRatio: args.maxDegradedRatio,
  };

  await mkdir(args.outDir, { recursive: true });
  const stamp = nowStamp();
  const jsonPath = path.join(args.outDir, `nationwide-reliability-${stamp}.json`);
  const mdPath = path.join(args.outDir, `nationwide-reliability-${stamp}.md`);

  await writeFile(jsonPath, JSON.stringify({ summary, results }, null, 2), 'utf8');
  await writeFile(mdPath, createMarkdown(results, summary), 'utf8');

  // Keep CLI output concise for CI logs.
  console.log(`[reliability] total=${summary.total}`);
  console.log(`[reliability] degraded=${summary.degradedCount} (${toPercent(summary.degradedRatio)})`);
  console.log(`[reliability] crossSidoMismatch=${summary.crossSidoMismatchCount}`);
  console.log(`[reliability] report.json=${jsonPath}`);
  console.log(`[reliability] report.md=${mdPath}`);

  if (args.enforce) {
    if (summary.degradedRatio > args.maxDegradedRatio) {
      throw new Error(
        `Degraded ratio ${toPercent(summary.degradedRatio)} exceeded max ${toPercent(args.maxDegradedRatio)}`,
      );
    }
    if (summary.crossSidoMismatchCount > 0) {
      throw new Error(`Cross-sido mismatch detected: ${summary.crossSidoMismatchCount}`);
    }
  }
}

main().catch((error) => {
  console.error('[reliability] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
