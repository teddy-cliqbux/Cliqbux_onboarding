/**
 * Run: node --test src/lib/businessWebsite.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBusinessWebsite,
  isValidBusinessWebsite,
  businessWebsiteError,
} from './businessWebsite.js';

describe('normalizeBusinessWebsite', () => {
  it('adds https when scheme missing', () => {
    assert.equal(normalizeBusinessWebsite('example.com'), 'https://example.com');
    assert.equal(normalizeBusinessWebsite('www.shop.co'), 'https://www.shop.co');
  });

  it('keeps http/https and trims', () => {
    assert.equal(normalizeBusinessWebsite('  https://a.com/path  '), 'https://a.com/path');
    assert.equal(normalizeBusinessWebsite('http://a.com'), 'http://a.com');
  });

  it('returns empty for blank', () => {
    assert.equal(normalizeBusinessWebsite(''), '');
    assert.equal(normalizeBusinessWebsite(null), '');
  });
});

describe('isValidBusinessWebsite', () => {
  it('accepts real domains with or without scheme', () => {
    assert.equal(isValidBusinessWebsite('https://www.example.com'), true);
    assert.equal(isValidBusinessWebsite('example.com'), true);
    assert.equal(isValidBusinessWebsite('https://instagram.com/myshop'), true);
    assert.equal(isValidBusinessWebsite('my-shop.co.uk'), true);
  });

  it('rejects junk / incomplete URLs (live applicant cases)', () => {
    assert.equal(isValidBusinessWebsite('asdf'), false);
    assert.equal(isValidBusinessWebsite('http://'), false);
    assert.equal(isValidBusinessWebsite('https://'), false);
    assert.equal(isValidBusinessWebsite('not a url'), false);
    assert.equal(isValidBusinessWebsite('cave life'), false);
    assert.equal(isValidBusinessWebsite('localhost'), false);
    assert.equal(isValidBusinessWebsite('http://localhost'), false);
    assert.equal(isValidBusinessWebsite('ftp://example.com'), false);
    assert.equal(isValidBusinessWebsite('https://192.168.1.1'), false);
  });
});

describe('businessWebsiteError', () => {
  it('requires URL when online volume needs it', () => {
    assert.match(businessWebsiteError('', { required: true }), /required/i);
    assert.equal(businessWebsiteError('', { required: false }), null);
  });

  it('messages invalid URLs', () => {
    assert.match(businessWebsiteError('asdf', { required: true }), /valid website/i);
    assert.equal(businessWebsiteError('https://ok.com', { required: true }), null);
  });
});
