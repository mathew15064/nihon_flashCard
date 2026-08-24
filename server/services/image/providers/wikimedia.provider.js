'use strict';

/*
 * Wikimedia Commons provider — no API key required.
 * Uses the public MediaWiki API to search bitmap files and normalizes
 * each result into the shared image shape used across the app.
 */

const https = require('https');

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'JapaneseFlashcard/1.0 (personal learning app)';

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .trim();
}

function cleanUrl(url) {
  // MediaWiki appends tracking params to imageinfo URLs — drop them.
  return String(url || '').split('?')[0];
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { family: 4, headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          const err = new Error(`Wikimedia Commons request failed (HTTP ${res.statusCode})`);
          err.code = 'IMAGE_PROVIDER_ERROR';
          err.status = 502;
          return reject(err);
        }
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            const err = new Error('Wikimedia Commons returned invalid JSON');
            err.code = 'IMAGE_PROVIDER_ERROR';
            err.status = 502;
            reject(err);
          }
        });
      })
      .on('error', (e) => {
        e.code = e.code || 'IMAGE_PROVIDER_ERROR';
        e.status = 502;
        reject(e);
      });
  });
}

async function search(query, limit = 8) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6', // File namespace
    gsrsearch: String(query),
    gsrlimit: String(Math.min(Math.max(1, limit), 20)),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '480'
  });

  const data = await getJson(`${COMMONS_API}?${params}`);
  const pages = (data.query && data.query.pages) || {};

  return Object.values(pages)
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .filter((p) => p.imageinfo && p.imageinfo[0])
    .map((p) => {
      const info = p.imageinfo[0];
      const meta = info.extmetadata || {};
      return {
        url: cleanUrl(info.url),
        thumbnailUrl: cleanUrl(info.thumburl || info.url),
        title: String(p.title || '').replace(/^File:/, ''),
        source: 'Wikimedia Commons',
        sourceUrl: info.descriptionurl || '',
        license: meta.LicenseShortName ? String(meta.LicenseShortName.value) : '',
        author: stripHtml(meta.Artist && meta.Artist.value)
      };
    });
}

module.exports = { search };
