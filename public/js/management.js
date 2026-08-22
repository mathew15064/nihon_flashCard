'use strict';

$(function () {
  const $list = $('#item-list');
  const $toolbar = $('#toolbar');
  const $error = $('#error');
  const $modal = $('#form-modal');
  const $form = $('#entity-form');

  let tab = 'users';
  let filters = {};
  let editingId = null;

  function showError(msg) {
    $error.text(msg).removeClass('hidden');
  }
  function hideError() {
    $error.addClass('hidden');
  }

  /* ---------------- field definitions ---------------- */

  const FIELDS = {
    users: [
      { name: 'username', label: 'Username', required: true },
      { name: 'displayName', label: 'Display name' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] }
    ],
    hiragana: [
      { name: 'character', label: 'Character', required: true },
      { name: 'romaji', label: 'Romaji' },
      { name: 'type', label: 'Type', type: 'select', options: ['basic', 'dakuten', 'handakuten', 'combination'] }
    ],
    katakana: [
      { name: 'character', label: 'Character', required: true },
      { name: 'romaji', label: 'Romaji' },
      { name: 'type', label: 'Type', type: 'select', options: ['basic', 'dakuten', 'handakuten', 'combination'] }
    ],
    kanji: [
      { name: 'kanji', label: 'Kanji', required: true },
      { name: 'onyomi', label: 'Onyomi (comma separated)' },
      { name: 'kunyomi', label: 'Kunyomi (comma separated)' },
      { name: 'meanings', label: 'Meanings (comma separated)' },
      { name: 'jlpt', label: 'JLPT', type: 'select', options: ['', 'N5', 'N4', 'N3', 'N2', 'N1'] },
      { name: 'lesson', label: 'Lesson', type: 'number' }
    ],
    vocabulary: [
      { name: 'word', label: 'Word', required: true },
      { name: 'reading', label: 'Reading' },
      { name: 'meaning', label: 'Meaning', required: true },
      { name: 'lesson', label: 'Lesson', type: 'number' },
      { name: 'category', label: 'Category' },
      { name: 'notes', label: 'Notes' }
    ]
  };

  const FILTERS = {
    hiragana: [{ name: 'type', label: 'All types', options: ['basic', 'dakuten', 'handakuten', 'combination'] }],
    katakana: [{ name: 'type', label: 'All types', options: ['basic', 'dakuten', 'handakuten', 'combination'] }],
    kanji: [
      { name: 'jlpt', label: 'All JLPT', options: ['N5', 'N4', 'N3', 'N2', 'N1'] },
      { name: 'lesson', label: 'All lessons', options: ['1', '2', '3'], numeric: true }
    ],
    vocabulary: [
      { name: 'lesson', label: 'All lessons', options: ['1', '2', '3'], numeric: true },
      { name: 'category', label: 'All categories', options: [], freeText: true }
    ]
  };

  function primaryLabel(item) {
    if (tab === 'users') return item.displayName + ' (@' + item.username + ')';
    if (tab === 'kanji') return item.kanji + ' — ' + (item.meanings || []).join(', ');
    if (tab === 'vocabulary') return `${item.word} — ${item.meaning}`;
    return item.character ? `${item.character} (${item.romaji || '?'})` : item.id;
  }

  function secondaryLabel(item) {
    if (tab === 'users') return item.status;
    if (tab === 'kanji')
      return [item.jlpt, item.lesson != null ? 'lesson ' + item.lesson : null].filter(Boolean).join(' · ') || item.id;
    return [item.type, item.category, item.lesson != null ? 'lesson ' + item.lesson : null].filter(Boolean).join(' · ') || item.id;
  }

  /* ---------------- list rendering ---------------- */

  function makeRow(item) {
    const $li = $(`
      <li class="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-slate-800 truncate"></p>
          <p class="text-xs text-slate-400"></p>
        </div>
        <div class="flex gap-2 shrink-0 text-xs"></div>
      </li>
    `);
    $li.find('p.font-medium').text(primaryLabel(item));
    $li.find('p.text-xs').text(secondaryLabel(item));

    const $btns = $li.find('div.flex.gap-2');

    if (tab === 'users' && item.status === 'inactive') {
      $btns.append(
        $('<button class="bg-emerald-600 text-white px-3 py-1.5 rounded-lg">Activate</button>').on(
          'click',
          () => updateUser(item.id, { status: 'active' })
        )
      );
    } else if (tab === 'users') {
      $btns.append(
        $('<button class="bg-amber-500 text-white px-3 py-1.5 rounded-lg">Deactivate</button>').on(
          'click',
          () => updateUser(item.id, { status: 'inactive' })
        )
      );
    }

    $btns.append(
      $('<button class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg">Edit</button>').on(
        'click',
        () => openForm(item)
      )
    );

    $btns.append(
      $('<button class="bg-red-500 text-white px-3 py-1.5 rounded-lg">Delete</button>').on('click', () =>
        deleteItem(item)
      )
    );

    return $li;
  }

  async function load() {
    hideError();
    try {
      let url;
      if (tab === 'users') {
        url = '/api/users?' + new URLSearchParams(filters).toString();
      } else {
        url = `/api/${tab}?limit=500&` + new URLSearchParams(filters).toString();
      }
      const items = await api.get(url);
      $list.empty();
      if (!items.length) {
        $list.append('<li class="text-slate-400 text-sm">Nothing found.</li>');
        return;
      }
      items.forEach((item) => $list.append(makeRow(item)));
    } catch (err) {
      showError(err.message || 'Could not load items');
    }
  }

  /* ---------------- toolbar ---------------- */

  function renderToolbar() {
    $toolbar.empty();
    filters = {};

    const searchDef = tab !== 'users';
    if (searchDef) {
      const $search = $(
        '<input id="search-input" type="search" placeholder="Search…" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48" />'
      );
      let timer;
      $search.on('input', function () {
        clearTimeout(timer);
        const value = $(this).val();
        timer = setTimeout(() => {
          if (value) filters.search = value;
          else delete filters.search;
          load();
        }, 300);
      });
      $toolbar.append($search);
    }

    (FILTERS[tab] || []).forEach((f) => {
      const $sel = $(`<select data-filter="${f.name}" class="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"></select>`);
      $sel.append(`<option value="">${f.label}</option>`);
      f.options.forEach((o) => $sel.append(`<option value="${o}">${o}</option>`));
      if (f.freeText) {
        $sel.remove();
        const $input = $(
          `<input type="text" placeholder="${f.label}" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-36" />`
        ).on('change', function () {
          if ($(this).val()) filters[f.name] = $(this).val();
          else delete filters[f.name];
          load();
        });
        $toolbar.append($input);
      } else {
        $sel.on('change', function () {
          if ($(this).val()) filters[f.name] = $(this).val();
          else delete filters[f.name];
          load();
        });
        $toolbar.append($sel);
      }
    });

    $toolbar.append(
      $('<button id="add-btn" class="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium">+ Add</button>').on(
        'click',
        () => openForm(null)
      )
    );
  }

  /* ---------------- create/edit form ---------------- */

  function openForm(item) {
    editingId = item ? item.id : null;
    $form.empty();

    $form.append('<h3 class="text-lg font-semibold text-slate-700">' + (editingId ? 'Edit' : 'New') + ' ' + tab + '</h3>');

    FIELDS[tab].forEach((f) => {
      const current = item ? item[f.name] : '';
      let $field;
      if (f.type === 'select') {
        $field = $(`<select name="${f.name}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"></select>`);
        f.options.forEach((o) => $field.append(`<option value="${o}">${o === '' ? '—' : o}</option>`));
        if (current !== undefined && current !== null) $field.val(String(current));
      } else if (f.type === 'number') {
        $field = $(`<input type="number" min="1" name="${f.name}" value="${current ?? ''}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />`);
      } else {
        const val = Array.isArray(current) ? current.join(', ') : current ?? '';
        $field = $(`<input type="text" name="${f.name}" value="${String(val).replace(/"/g, '&quot;')}" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />`);
      }
      $form.append(
        $('<label class="block"><span class="text-xs text-slate-500">' + f.label + (f.required ? ' *' : '') + '</span></label>').append($field)
      );
    });

    $form.append(
      $('<div class="flex gap-2 pt-2"></div>')
        .append($('<button type="submit" class="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium">Save</button>'))
        .append($('<button type="button" id="cancel-btn" class="flex-1 bg-slate-200 text-slate-700 py-2 rounded-lg text-sm">Cancel</button>')
          .on('click', () => $modal.addClass('hidden')))
    );

    $form.off('submit').on('submit', function (e) {
      e.preventDefault();
      saveItem(item);
    });

    $modal.removeClass('hidden');
  }

  async function saveItem(existing) {
    const payload = {};
    FIELDS[tab].forEach((f) => {
      const raw = $form.find(`[name="${f.name}"]`).val();
      if (raw === '') {
        if (f.required) payload[f.name] = raw;
        return;
      }
      if (['onyomi', 'kunyomi', 'meanings'].includes(f.name)) {
        payload[f.name] = raw.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (f.type === 'number') {
        payload[f.name] = Number(raw);
      } else {
        payload[f.name] = raw;
      }
    });
    if (!editingId && tab === 'vocabulary' && !payload.notes) delete payload.notes;

    try {
      if (editingId) {
        const url = tab === 'users' ? `/api/users/${editingId}` : `/api/${tab}/${editingId}`;
        await api.put(url, payload);
      } else {
        const url = tab === 'users' ? '/api/users' : `/api/${tab}`;
        await api.post(url, payload);
      }
      $modal.addClass('hidden');
      load();
    } catch (err) {
      showError(err.message || 'Save failed');
      $modal.addClass('hidden');
    }
  }

  async function updateUser(id, patch) {
    hideError();
    try {
      await api.put(`/api/users/${id}`, patch);
      load();
    } catch (err) {
      showError(err.message || 'Update failed');
    }
  }

  async function deleteItem(item) {
    hideError();
    let url = tab === 'users' ? `/api/users/${item.id}` : `/api/${tab}/${item.id}`;
    if (tab === 'users' && confirm(`Delete ${item.username} and force-archive learning data?`)) {
      url += '?force=true';
    } else if (!confirm('Delete this item?')) {
      return;
    }
    try {
      await api.delete(url);
      load();
    } catch (err) {
      if (err.code === 'USER_HAS_LEARNING_DATA' && confirm(err.message)) {
        try {
          await api.delete(url + '?force=true');
          load();
          return;
        } catch (e2) {
          showError(e2.message || 'Delete failed');
          return;
        }
      }
      showError(err.message || 'Delete failed');
    }
  }

  /* ---------------- tabs ---------------- */

  $('.tab-btn').on('click', function () {
    tab = $(this).data('tab');
    page = 1;
    $('.tab-btn')
      .removeClass('bg-indigo-600 text-white')
      .addClass('bg-slate-200 text-slate-700');
    $(this).addClass('bg-indigo-600 text-white').removeClass('bg-slate-200 text-slate-700');
    renderToolbar();
    load();
  });

  let page = 1;
  renderToolbar();
  load();
});
