const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rawPath = path.join(root, 'src', 'lib', 'deploymentChecklistCatalog.raw.json');
const catalog = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

const PHASE_LABELS = {
  pre_installation: 'Pre-Installation',
  hardware: 'Hardware',
  network: 'Network',
  pos_software: 'POS Software',
  payment: 'Payment',
  product: 'Product',
  employee: 'Employee',
  peripheral: 'Peripheral',
  functional: 'Functional',
  reporting: 'Reporting',
  integrations: 'Integrations',
  training: 'Training',
  go_live: 'Go Live',
  post_installation: 'Post-Installation',
  airport_enterprise: 'Airport Enterprise',
};

const seen = new Set();
const phases = [];
for (const item of catalog) {
  if (seen.has(item.phase)) continue;
  seen.add(item.phase);
  phases.push({
    id: item.phase,
    num: item.phaseNum,
    label: PHASE_LABELS[item.phase] || item.phase,
  });
}

const statuses = ['scheduled', 'in_progress', 'hold', 'completed'];
const catalogJson = JSON.stringify(catalog, null, 2);
const phasesJson = JSON.stringify(phases, null, 2);

const js = [
  '/**',
  ' * Deployment checklist catalog.',
  ' * Source of truth: ./deploymentChecklistCatalog.raw.json',
  ' * Regenerate via: node scripts/gen-deployment-catalog.cjs',
  ' */',
  '',
  'export const DEPLOYMENT_CATALOG = ' + catalogJson + ';',
  '',
  'export const PHASES = ' + phasesJson + ';',
  '',
  "export const DEPLOYMENT_STATUSES = ['scheduled', 'in_progress', 'hold', 'completed'];",
  '',
  'export const STATUS_LABELS = {',
  "  scheduled: 'Scheduled',",
  "  in_progress: 'In Progress',",
  "  hold: 'Hold',",
  "  completed: 'Completed',",
  '};',
  '',
  '/** Merchant pack: audience merchant or shared. Excludes airport_enterprise unless includeEnterprise. */',
  'export function merchantPackItems({ includeEnterprise = false } = {}) {',
  '  return DEPLOYMENT_CATALOG.filter((item) => {',
  "    if (item.audience !== 'merchant' && item.audience !== 'shared') return false;",
  "    if (!includeEnterprise && item.phase === 'airport_enterprise') return false;",
  '    return true;',
  '  });',
  '}',
  '',
  '/** Full location catalog. Excludes airport_enterprise unless includeEnterprise. */',
  'export function catalogForLocation({ includeEnterprise = false } = {}) {',
  '  return DEPLOYMENT_CATALOG.filter((item) => {',
  "    if (!includeEnterprise && item.phase === 'airport_enterprise') return false;",
  '    return true;',
  '  });',
  '}',
  '',
  'export function getCatalogItem(key) {',
  '  if (!key) return undefined;',
  '  return DEPLOYMENT_CATALOG.find((item) => item.key === key);',
  '}',
  '',
].join('\n');

const ts = [
  '// Sync with src/lib/deploymentChecklistCatalog.raw.json',
  '// Generated - do not hand-edit catalog data; regenerate from the raw JSON.',
  '',
  "export type DeploymentStatus = 'scheduled' | 'in_progress' | 'hold' | 'completed';",
  '',
  'export type DeploymentCatalogItem = {',
  '  phase: string;',
  '  phaseNum: number | string;',
  '  key: string;',
  '  title: string;',
  '  description: string;',
  '  audience: string;',
  '  autoRule: string | null;',
  '  requiresUpload: boolean;',
  '};',
  '',
  'export type DeploymentPhase = {',
  '  id: string;',
  '  num: number | string;',
  '  label: string;',
  '};',
  '',
  'export const DEPLOYMENT_CATALOG = ' + catalogJson + ' as const satisfies readonly DeploymentCatalogItem[];',
  '',
  'export const PHASES: DeploymentPhase[] = ' + phasesJson + ';',
  '',
  'export const DEPLOYMENT_STATUSES: DeploymentStatus[] = ' + JSON.stringify(statuses) + ';',
  '',
].join('\n');

const jsDest = path.join(root, 'src', 'lib', 'deploymentChecklistCatalog.js');
const tsDest = path.join(root, 'base44', 'functions', 'manageMerchantChecklist', 'deploymentCatalog.ts');
fs.mkdirSync(path.dirname(tsDest), { recursive: true });
fs.writeFileSync(jsDest, js, 'utf8');
fs.writeFileSync(tsDest, ts, 'utf8');
console.log('Wrote', jsDest);
console.log('Wrote', tsDest);
console.log('items', catalog.length, 'phases', phases.length);