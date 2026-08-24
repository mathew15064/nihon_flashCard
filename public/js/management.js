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

  /* ---------------- image picker (vocabulary) ---------------- */

  function imageQuery(item) {
    // Prefer semantic meaning: EN -> VI -> romanization -> word
    return (item.meaning || item.meaningVi || item.romanization || item.word || '').trim();
  }

  function metadataLine(meta) {
    return [
      `${I18n.t('image.source')}: ${meta.source || '—'}`,
      `${I18n.t('image.license')}: ${meta.license || '—'}`,
      `${I18n.t('image.author')}: ${meta.author || '—'}`
    ].join(' · ');
  }

  function openImagePicker(item) {
    const $modal = $(
      '<div class="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20"></div>'
    );
    const $panel = $('<div class="bg-white rounded-xl shadow-xl p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"></div>');
    const $title = $('<h3 class="text-lg font-semibold text-slate-700"></h3>').text(
      `${I18n.t('image.searchBtn')} — ${item.word}`
    );
    const $searchRow = $('<div class="flex gap-2"></div>');
    const $input = $(
      '<input type="text" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm" />'
    ).val(imageQuery(item)).attr('placeholder', I18n.t('image.searchPlaceholder'));
    const $searchBtn = $(
      '<button class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium"></button>'
    ).text(I18n.t('image.searchBtn'));
    const $status = $('<p class="text-sm text-slate-500"></p>');
    const $grid = $('<div class="grid grid-cols-3 gap-2"></div>');
    const $preview = $('<div class="hidden space-y-1"></div>');
    let selected = null;

    function showPreview(meta) {
      if (!meta) {
        $preview.addClass('hidden').empty();
        return;
      }
      selected = meta;
      $preview.empty().removeClass('hidden');

      const $imgWrap = $('<div class="rounded-xl overflow-hidden bg-slate-100 aspect-[4/3] max-w-[240px]"></div>');
      const $img = $('<img class="w-full h-full object-cover" />');
      $img[0].src = meta.thumbnailUrl || meta.url;
      $imgWrap.append($img);

      const $metaText = $('<p class="text-xs text-slate-500 break-words"></p>').text(metadataLine(meta));
      const $link = $('<a target="_blank" rel="noopener noreferrer" class="text-xs text-indigo-600 hover:underline block"></a>')
        .attr('href', meta.sourceUrl)
        .text(meta.sourceUrl);
      const $actions = $('<div class="flex gap-2 pt-1"></div>');
      const $save = $('<button class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium"></button>')
        .text(I18n.t('image.save'))
        .on('click', async () => {
          try {
            await api.put(`/api/vocabulary/${item.id}`, { image: meta });
            $modal.remove();
            load();
          } catch (err) {
            $status.text(err.message || I18n.t('review.loadError'));
          }
        });
      const $remove = $('<button class="bg-red-500 text-white px-4 py-2 rounded-lg text-sm"></button>')
        .text(I18n.t('image.remove'))
        .on('click', async () => {
          try {
            await api.put(`/api/vocabulary/${item.id}`, { image: null });
            $modal.remove();
            load();
          } catch (err) {
            $status.text(err.message || I18n.t('review.loadError'));
          }
        });
      const $cancel = $('<button class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm">Cancel</button>')
        .on('click', () => $modal.remove());

      $preview.append(
        $('<p class="text-xs font-medium text-slate-400"></p>').text(I18n.t('image.selected')),
        $imgWrap,
        $metaText,
        $link,
        $actions.append($save, item.image ? $remove : '', $cancel)
      );
    }

    async function doSearch() {
      const q = $input.val().trim();
      if (!q) return;
      $grid.empty();
      $preview.addClass('hidden').empty();
      $status.text('…');
      try {
        const results = await api.get('/api/images/search?limit=12&q=' + encodeURIComponent(q));
        $status.text('');
        if (!results.length) {
          $status.text(I18n.t('image.noResults'));
          return;
        }
        results.forEach((meta) => {
          const $cell = $(
            '<button class="rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-500 focus:border-indigo-600 bg-slate-100 aspect-square"></button>'
          );
          const $thumb = $('<img class="w-full h-full object-cover" />');
          $thumb[0].src = meta.thumbnailUrl || meta.url;
          $cell.attr('title', meta.title).append($thumb).on('click', () => {
            $grid.find('button').addClass('border-transparent').removeClass('border-indigo-600');
            $cell.removeClass('border-transparent').addClass('border-indigo-600');
            showPreview(meta);
          });
          $grid.append($cell);
        });
      } catch (err) {
        $status.text(err.message || I18n.t('image.loadError'));
      }
    }

    $searchBtn.on('click', doSearch);
    $input.on('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });

    const $close = $('<button class="bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm">Close</button>')
      .on('click', () => $modal.remove());

    $searchRow.append($input, $searchBtn);
    $panel.append($title, $searchRow, $status, $grid, $preview, $close);
    $modal.append($panel);
    $('body').append($modal);
    doSearch();
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

    if (tab === 'vocabulary') {
      $btns.append(
        $('<button class="bg-slate-600 text-white px-3 py-1.5 rounded-lg"></button>')
          .text(I18n.t('image.searchBtn'))
          .on('click', () => openImagePicker(item))
      );
      if (item.image && item.image.url) {
        $li.find('p.text-xs').prepend('🖼 ');
      }
    }

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
