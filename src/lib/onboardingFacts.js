/**
 * Shared fact keys + catalog mapping for ask-once handoffs.
 * Completing a checklist item or accepting a transcript suggestion upserts these facts.
 */

export const HANDOFF_STAGES = [
  'sales',
  'underwriting',
  'implementation',
  'installation',
  'support',
];

export const HANDOFF_STAGE_LABELS = {
  sales: 'Sales',
  underwriting: 'Underwriting',
  implementation: 'Implementation',
  installation: 'Installation',
  support: 'Support',
};

/** Next stage in the pipeline (null at end). */
export function nextHandoffStage(current) {
  const i = HANDOFF_STAGES.indexOf(current);
  if (i < 0 || i >= HANDOFF_STAGES.length - 1) return null;
  return HANDOFF_STAGES[i + 1];
}

/**
 * Map deployment catalogKey / autoRule → canonical factKey.
 * Returns null if the item is not a reusable merchant fact.
 */
export function catalogKeyToFactKey(catalogKey, autoRule) {
  const key = String(catalogKey || '').toLowerCase();
  const rule = String(autoRule || '').toLowerCase();

  if (rule === 'hours_present' || key.includes('business_hours') || key.includes('verify_business_hours')) {
    return 'business_hours';
  }
  if (rule === 'menu_uploaded' || key.includes('menu_product') || key.includes('confirm_menu')) {
    return 'menu';
  }
  if (rule === 'mid_live' || key.includes('merchant_id_mid') || key.includes('verify_merchant_id')) {
    return 'mid';
  }
  if (rule === 'quote_paid' || key.includes('signed_agreement') || key.includes('agreement_sow')) {
    return 'sow_signed';
  }
  if (rule === 'install_date_set' || key.includes('installation_date')) {
    return 'install_date';
  }
  if (key.includes('store_contact') || key.includes('contact_information')) {
    return 'store_contact';
  }
  if (key.includes('floor_plan')) return 'floor_plan';
  if (key.includes('tax_rate')) return 'tax_rates';
  if (key.includes('employee_list')) return 'employee_list';
  if (key.includes('printer_location')) return 'printer_locations';
  if (key.includes('kitchen_workflow')) return 'kitchen_workflow';
  if (key.includes('internet_provider')) return 'isp';
  if (key.includes('client_sign') || key.includes('obtain_client_sign') || key.includes('sign-off') || key.includes('sign_off')) {
    return 'client_signoff';
  }
  if (key.includes('training_complete') || key.includes('confirm_training')) {
    return 'training_complete';
  }
  return null;
}

/** Fact keys that block advancing *from* a stage (hard) unless override. */
export const STAGE_HARD_BLOCKS = {
  sales: [],
  underwriting: ['open_agent_docs'], // special: open UW agent doc requests
  implementation: [],
  installation: [],
  support: [],
};

/** Soft warnings when advancing (never hard-block quote). */
export const STAGE_SOFT_WARNINGS = {
  sales: ['quote_missing'],
  underwriting: [],
  implementation: ['business_hours', 'menu', 'store_contact'],
  installation: ['hold_items'],
  support: [],
};

/** Which fact keys matter most per stage for "missing" panels. */
export const STAGE_FACT_FOCUS = {
  sales: ['store_contact', 'sow_signed'],
  underwriting: ['mid', 'sow_signed'],
  implementation: [
    'store_contact',
    'business_hours',
    'tax_rates',
    'menu',
    'employee_list',
    'floor_plan',
    'printer_locations',
    'kitchen_workflow',
    'isp',
  ],
  installation: ['install_date', 'mid', 'business_hours', 'menu', 'client_signoff'],
  support: ['client_signoff', 'training_complete', 'mid'],
};

export const FACT_KEY_LABELS = {
  business_hours: 'Business hours',
  store_contact: 'Store contact',
  tax_rates: 'Tax rates',
  menu: 'Menu / products',
  employee_list: 'Employee list',
  floor_plan: 'Floor plan',
  printer_locations: 'Printer locations',
  kitchen_workflow: 'Kitchen workflow',
  isp: 'Internet provider',
  mid: 'Merchant ID (MID)',
  sow_signed: 'Agreement / SOW',
  install_date: 'Install date',
  client_signoff: 'Client sign-off',
  training_complete: 'Training complete',
};

/** Heuristic phrases for transcript matching (factKey → phrases). */
export const FACT_TRANSCRIPT_PHRASES = {
  business_hours: ['hours are', 'open from', 'we open', 'closing at', 'mon-fri', 'monday through'],
  store_contact: ['primary contact', 'reach me at', 'my number', 'cell is', 'email is'],
  tax_rates: ['tax rate', 'sales tax', 'tax percent'],
  menu: ['menu', 'product list', 'items we sell', 'upload the menu'],
  employee_list: ['employees', 'staff list', 'team members', 'who works'],
  floor_plan: ['floor plan', 'layout of the store', 'store layout'],
  printer_locations: ['receipt printer', 'kitchen printer', 'printer by'],
  kitchen_workflow: ['kitchen workflow', 'expo', 'kds', 'ticket to the kitchen'],
  isp: ['internet', 'isp', 'comcast', 'spectrum', 'fiber', 'wifi'],
  mid: ['merchant id', 'mid is', 'elavon mid'],
  install_date: ['install on', 'installation date', 'come out on', 'schedule install'],
  client_signoff: ['signed off', 'we are good to go', 'approved the install'],
  training_complete: ['training done', 'staff trained', 'finished training'],
  sow_signed: ['signed the agreement', 'signed the sow', 'contract signed'],
};
