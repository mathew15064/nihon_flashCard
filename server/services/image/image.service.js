'use strict';

/*
 * Image service — thin provider abstraction.
 * Flashcard/content systems never know which provider is used; they only see
 * normalized image objects:
 *   { url, thumbnailUrl, title, source, sourceUrl, license, author }
 *
 * Providers live in ./providers/*. Adding a new provider means adding a file
 * here and switching IMAGE_PROVIDER below (or env override). No API keys are
 * required for the default Wikimedia Commons provider; if a future provider
 * needs one, read it from env IMAGE_PROVIDER_API_KEY — never hard-code it.
 */

const wikimediaProvider = require('./providers/wikimedia.provider');

const PROVIDERS = {
  wikimedia: wikimediaProvider
};

function activeProviderName() {
  return process.env.IMAGE_PROVIDER || 'wikimedia';
}

function assertValidImageUrl(url, field = 'image.url') {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('bad protocol');
    }
  } catch (e) {
    const err = new Error(`Field "${field}" must be a valid http(s) URL`);
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
}

function normalizeImageMetadata(image) {
  if (image === null) return null;
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    const err = new Error('Field "image" must be an object or null');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }

  const out = {};
  for (const key of ['url', 'thumbnailUrl', 'source', 'sourceUrl', 'license', 'author']) {
    if (image[key] !== undefined && image[key] !== null) {
      out[key] = String(image[key]).trim();
    }
  }
  if (!out.url) {
    const err = new Error('Field "image.url" is required');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
  assertValidImageUrl(out.url, 'image.url');
  if (out.thumbnailUrl) assertValidImageUrl(out.thumbnailUrl, 'image.thumbnailUrl');
  if (out.sourceUrl) assertValidImageUrl(out.sourceUrl, 'image.sourceUrl');
  if (!out.source) out.source = 'Wikimedia Commons';
  return out;
}

function isConfigured() {
  // Wikimedia Commons needs no key; other providers may check env here.
  return Boolean(PROVIDERS[activeProviderName()]);
}

async function search(query, limit) {
  const needle = String(query || '').trim();
  if (!needle) {
    const err = new Error('Query parameter "q" is required');
    err.code = 'VALIDATION_ERROR';
    err.status = 400;
    throw err;
  }
  const provider = PROVIDERS[activeProviderName()];
  if (!provider) {
    const err = new Error('No image provider configured');
    err.code = 'IMAGE_PROVIDER_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
  return provider.search(needle, limit);
}

module.exports = { search, isConfigured, normalizeImageMetadata, activeProviderName };
