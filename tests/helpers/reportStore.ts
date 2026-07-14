/**
 * File-backed scenario store so Playwright workers can write results that the
 * reporter process reads on suite end (in-memory module state does not cross
 * the worker/reporter boundary).
 */

import fs from 'node:fs';
import path from 'node:path';

export type ScenarioResult = {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  observed: string;
  dbState: string;
  citations: Array<{ file: string; line: number; snippet?: string }>;
  details?: string;
  matrix?: Array<{ state: string; mcc: string; portalOutcome: string; desiredOutcome: string }>;
};

const STORE_DIR = path.resolve(process.cwd(), 'test-results');
const STORE_FILE = path.join(STORE_DIR, 'stress-scenarios.json');

function readAll(): ScenarioResult[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) as ScenarioResult[];
  } catch {
    return [];
  }
}

function writeAll(results: ScenarioResult[]) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(results, null, 2), 'utf8');
}

export function clearScenarioResults() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  writeAll([]);
}

export function recordScenario(result: ScenarioResult) {
  const results = readAll();
  const idx = results.findIndex((r) => r.name === result.name);
  if (idx >= 0) results[idx] = result;
  else results.push(result);
  writeAll(results);
}

export function getScenarioResults(): ScenarioResult[] {
  return readAll();
}
