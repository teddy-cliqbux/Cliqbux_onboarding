/**
 * Client-side RSA-OAEP encryption for Legacy POS credential vault.
 * Plaintext passwords must NEVER leave the browser.
 *
 * Public key: import.meta.env.VITE_POS_VAULT_PUBLIC_KEY (PEM or base64 SPKI).
 * Local dev without a key: generates a temporary mock keypair (session-scoped)
 * so engineers can exercise the UI — ciphertext from mock keys is not production-safe.
 */

const MOCK_KEY_STORAGE = 'cb_pos_vault_mock_public_spki_b64';
const ALGORITHM = { name: 'RSA-OAEP', hash: 'SHA-256' };

function pemToArrayBuffer(pem) {
  const b64 = String(pem)
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function importPublicKeyFromEnv(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let spki;
  if (trimmed.includes('BEGIN PUBLIC KEY')) {
    spki = pemToArrayBuffer(trimmed);
  } else {
    const binary = atob(trimmed);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    spki = bytes.buffer;
  }
  return crypto.subtle.importKey('spki', spki, ALGORITHM, false, ['encrypt']);
}

async function getOrCreateMockPublicKey() {
  if (typeof sessionStorage !== 'undefined') {
    const cached = sessionStorage.getItem(MOCK_KEY_STORAGE);
    if (cached) {
      const binary = atob(cached);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return crypto.subtle.importKey('spki', bytes.buffer, ALGORITHM, false, ['encrypt']);
    }
  }

  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const b64 = arrayBufferToBase64(spki);
  try {
    sessionStorage.setItem(MOCK_KEY_STORAGE, b64);
  } catch {
    /* ignore quota / private mode */
  }
  console.warn(
    '[posCredentialCrypto] VITE_POS_VAULT_PUBLIC_KEY unset — using session mock RSA key. Not for production.'
  );
  return pair.publicKey;
}

async function resolvePublicKey() {
  const fromEnv = await importPublicKeyFromEnv(import.meta.env.VITE_POS_VAULT_PUBLIC_KEY);
  if (fromEnv) return { key: fromEnv, keySource: 'env' };
  const mock = await getOrCreateMockPublicKey();
  return { key: mock, keySource: 'mock' };
}

/**
 * Encrypt a UTF-8 password string with RSA-OAEP.
 * @returns {{ ciphertext: string, keySource: 'env' | 'mock', algorithm: string }}
 */
export async function encryptPosPassword(plaintext) {
  if (plaintext == null || String(plaintext).length === 0) {
    throw new Error('Password is required for encryption');
  }
  const { key, keySource } = await resolvePublicKey();
  const encoded = new TextEncoder().encode(String(plaintext));
  const cipherBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, encoded);
  return {
    ciphertext: arrayBufferToBase64(cipherBuf),
    keySource,
    algorithm: 'RSA-OAEP-SHA256',
  };
}

export const POS_CONSENT_TEXT_VERSION = '2026-07-13-v1';

export const POS_CONSENT_WAIVER =
  'I authorize Cliqbux to access my legacy POS system for data migration. I acknowledge that sharing root administrator credentials may violate my POS provider\'s terms of service, and I agree to hold Cliqbux harmless from any security incidents arising from credential sharing.';
