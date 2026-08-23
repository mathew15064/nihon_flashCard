'use strict';

/*
 * Lightweight client-side i18n.
 * - Dictionaries live in vi.js / en.js (window.I18N_VI / window.I18N_EN).
 * - UI strings only; content translations belong to the content data itself.
 * - Selected locale is stored in localStorage key "locale" (default "vi").
 * Usage:
 *   I18n.t('learn.correct')            -> translated string
 *   <element data-i18n="learn.title">  -> auto-translated by I18n.apply()
 *   I18n.setLocale('en')               -> save + re-translate + trigger locale:changed
 */
const I18n = (function () {
  const STORAGE_KEY = 'locale';
  const DEFAULT_LOCALE = 'vi';
  const dicts = {
    vi: window.I18N_VI || {},
    en: window.I18N_EN || {}
  };

  let locale = localStorage.getItem(STORAGE_KEY);
  if (!dicts[locale]) locale = DEFAULT_LOCALE;

  function lookup(dict, path) {
    return path.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, dict);
  }

  function t(path, vars) {
    let s = lookup(dicts[locale], path);
    if (typeof s !== 'string') s = lookup(dicts[DEFAULT_LOCALE], path);
    if (typeof s !== 'string') return path;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace('{' + k + '}', vars[k]);
      });
    }
    return s;
  }

  function apply(root) {
    $(root || document).find('[data-i18n]').each(function () {
      $(this).text(t($(this).data('i18n')));
    });
  }

  function setLocale(next) {
    if (!dicts[next] || next === locale) return;
    locale = next;
    localStorage.setItem(STORAGE_KEY, locale);
    const $sel = $('#locale-select');
    if ($sel.length) $sel.val(locale);
    apply();
    $(document).trigger('locale:changed');
  }

  return {
    t: t,
    apply: apply,
    setLocale: setLocale,
    locale: function () { return locale; },
    localizeContentText: function (value) {
      // Content-level fallback for plain strings (not used for objects).
      return typeof value === 'string' && value.trim() ? value : '';
    }
  };
})();

window.I18n = I18n;

$(function () {
  const $sel = $('#locale-select');
  if ($sel.length) {
    $sel.val(I18n.locale());
    $sel.on('change', function () { I18n.setLocale($(this).val()); });
  }
  I18n.apply();
});
