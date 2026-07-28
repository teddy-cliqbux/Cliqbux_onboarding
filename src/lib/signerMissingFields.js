/**
 * Field-level KYC gaps for Owners rows + Welcome hub People milestone.
 * Completeness here is about data present — not identityStatus alone
 * (agents can partial-save without verifying).
 */
import { isControlPerson, needsKyc } from '@/lib/signerRules';

/** @returns {string[]} human-readable missing field labels */
export function signerMissingFields(s) {
  if (!s) return ['Name'];
  const miss = [];
  if (!s.firstName || !s.lastName) miss.push('Name');
  if (!s.signerEmail) miss.push('Email');
  if (s.ownershipPercentage == null || s.ownershipPercentage === '') miss.push('Ownership %');

  const needsIdentity = needsKyc(s) || isControlPerson(s);
  if (needsIdentity) {
    if (!s.dobYear || !s.dobMonth || !s.dobDay) miss.push('DOB');
    const ssnDigits = String(s.ssn || '').replace(/\D/g, '');
    if (ssnDigits.length < 9) miss.push('SSN');
    if (!s.homeStreet) miss.push('Home street');
    if (!s.homeCity) miss.push('Home city');
    if (!s.homeState) miss.push('Home state');
    if (!s.homeZip) miss.push('Home ZIP');
    if (!s.titleType && !s.title) miss.push('Title');
  }
  return miss;
}

/** True when roster principals have no field-level KYC gaps. */
export function peopleIdentityFieldsComplete(signers = []) {
  const list = signers || [];
  if (list.length === 0) return false;
  const principals = list.filter((s) => needsKyc(s) || isControlPerson(s));
  if (principals.length === 0) return false;
  return principals.every((s) => signerMissingFields(s).length === 0);
}

/** Attention rows for Welcome hub (label + missing keys). */
export function peopleAttentionItems(signers = []) {
  return (signers || [])
    .filter((s) => needsKyc(s) || isControlPerson(s))
    .map((s) => {
      const missing = signerMissingFields(s);
      if (!missing.length) return null;
      const label = `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.signerEmail || 'Owner';
      return { label, missing };
    })
    .filter(Boolean);
}
