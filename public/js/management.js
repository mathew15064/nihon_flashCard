'use strict';

$(function () {
  let tab = 'users'; // 'users' | 'hiragana' | 'katakana' | 'kanji' | 'vocabulary'
  let filters = {};
  let editingId = null;

  const $list = $('#item-list');
  const $toolbar = $('#toolbar');
  const $error = $('#error');
  const $modal = $('#form-modal');
  const $form = $('#entity-form');

  function showError(msg) {
    $error.text(msg).removeClass('hidden');
  }

  function hideError() {
    $error.addClass('hidden');
  }

  /* ---------------- schema definitions for CRUD ---------------- */

  const FIELDS = {
    users: [
      { name: 'username', label: 'Username', required: true },
      { name: 'displayName', label: 'Display Name' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] }
    ],
    hiragana: [
      { name: 'character', label: 'Character', required: true },
      { name: 'romaji', label: 'Romaji', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['basic', 'dakuten', 'handakuten', 'combination'] }
    ],
    katakana: [
      { name: 'character', label: 'Character', required: true },
      { name: 'romaji', label: 'Romaji', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['basic', 'dakuten', 'handakuten', 'combination'] }
    ],
    kanji: [
      { name: 'kanji', label: 'Kanji', required: true },
      { name: 'onyomi', label: 'Onyomi (comma-separated)' },
      { name: 'kunyomi', label: 'Kunyomi (comma-separated)' },
      { name: 'meanings', label: 'Meanings (comma-separated)', required: true },
      { name: 'jlpt', label: 'JLPT', type: 'select', options: ['N5', 'N4', 'N3', 'N2', 'N1'] },
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

  function getFilters() {
    return {
      hiragana: [{ name: 'type', label: I18n.t('management.allTypes'), options: ['basic', 'dakuten', 'handakuten', 'combination'] }],
      katakana: [{ name: 'type', label: I18n.t('management.allTypes'), options: ['basic', 'dakuten', 'handakuten', 'combination'] }],
      kanji: [
        { name: 'jlpt', label: I18n.t('management.allJlpt'), options: ['N5', 'N4', 'N3', 'N2', 'N1'] },
        { name: 'lesson', label: I18n.t('management.allLessons'), options: ['1', '2', '3'], numeric: true }
      ],
      vocabulary: [
        { name: 'lesson', label: I18n.t('management.allLessons'), options: ['1', '2', '3'], numeric: true },
        { name: 'category', label: I18n.t('management.allCategories'), options: [], freeText: true }
      ]
    };
  }

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
    const $panel = $('<div class="bg-white rounded-[18px] border border-hairline p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto"></div>');
    const $title = $('<h3 class="text-lg font-semibold text-ink"></h3>').text(
      `${I18n.t('image.searchBtn')} — ${item.word}`
    );
    const $searchRow = $('<div class="flex gap-2"></div>');
    const $input = $(
      '<input type="text" class="apple-input flex-1 text-sm !py-2 !px-3" />'
    ).val(imageQuery(item)).attr('placeholder', I18n.t('image.searchPlaceholder'));
    const $searchBtn = $(
      '<button class="apple-btn apple-btn-primary !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>'
    ).text(I18n.t('image.searchBtn'));
    const $status = $('<p class="apple-caption"></p>');
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

      const $imgWrap = $('<div class="rounded-[18px] overflow-hidden bg-parchment aspect-[4/3] max-w-[240px]"></div>');
      const $img = $('<img class="w-full h-full object-cover" />');
      $img[0].src = meta.thumbnailUrl || meta.url;
      $imgWrap.append($img);

      const $metaText = $('<p class="apple-caption break-words"></p>').text(metadataLine(meta));
      const $link = $('<a target="_blank" rel="noopener noreferrer" class="text-xs text-action hover:underline block"></a>')
        .attr('href', meta.sourceUrl)
        .text(meta.sourceUrl);
      const $actions = $('<div class="flex gap-2 pt-1"></div>');
      const $save = $('<button class="apple-btn apple-btn-primary !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
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
      const $remove = $('<button class="apple-btn apple-btn-wrong !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
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
      const $cancel = $('<button class="apple-btn apple-btn-secondary !min-h-[36px] !py-1.5 !px-3 !text-sm">Cancel</button>')
        .on('click', () => $modal.remove());

      $preview.append(
        $('<p class="apple-caption font-medium"></p>').text(I18n.t('image.selected')),
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
            '<button class="rounded-[11px] overflow-hidden border-2 border-transparent hover:border-action focus:border-action bg-parchment aspect-square"></button>'
          );
          const $thumb = $('<img class="w-full h-full object-cover" />');
          $thumb[0].src = meta.thumbnailUrl || meta.url;
          $cell.attr('title', meta.title).append($thumb).on('click', () => {
            $grid.find('button').addClass('border-transparent').removeClass('border-action');
            $cell.removeClass('border-transparent').addClass('border-action');
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

    const $close = $('<button class="apple-btn apple-btn-secondary !min-h-[36px] !py-1.5 !px-3 !text-sm">Close</button>')
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
      <li class="apple-card flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-ink truncate"></p>
          <p class="apple-caption"></p>
        </div>
        <div class="flex gap-2 shrink-0 text-xs"></div>
      </li>
    `);
    $li.find('p.font-medium').text(primaryLabel(item));
    $li.find('p.apple-caption').text(secondaryLabel(item));

    const $btns = $li.find('div.flex.gap-2');

    if (tab === 'vocabulary') {
      const hasImage = Boolean(item.image);
      const label = hasImage ? `${I18n.t('image.searchBtn')} [Image]` : I18n.t('image.searchBtn');
      $btns.append(
        $('<button class="apple-btn apple-btn-secondary !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
          .text(label)
          .on('click', () => openImagePicker(item))
      );
    }

    if (tab === 'users' && item.status === 'inactive') {
      $btns.append(
        $('<button class="apple-btn apple-btn-primary !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
          .text(I18n.t('management.activate'))
          .on('click', () => updateUser(item.id, { status: 'active' }))
      );
    } else if (tab === 'users') {
      $btns.append(
        $('<button class="apple-btn apple-btn-secondary !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
          .text(I18n.t('management.deactivate'))
          .on('click', () => updateUser(item.id, { status: 'inactive' }))
      );
    }

    $btns.append(
      $('<button class="apple-btn apple-btn-primary !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
        .text(I18n.t('management.edit'))
        .on('click', () => openForm(item))
    );

    $btns.append(
      $('<button class="apple-btn apple-btn-wrong !min-h-[36px] !py-1.5 !px-3 !text-sm"></button>')
        .text(I18n.t('management.delete'))
        .on('click', () => deleteItem(item))
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
        $list.append($('<li class="apple-caption"></li>').text(I18n.t('management.empty')));
        return;
      }
      items.forEach((item) => $list.append(makeRow(item)));
    } catch (err) {
      showError(err.message || I18n.t('management.loadError'));
    }
  }

  /* ---------------- toolbar ---------------- */

  function renderToolbar() {
    $toolbar.empty();
    filters = {};

    const searchDef = tab !== 'users';
    if (searchDef) {
      const $search = $(
        `<input id="search-input" type="search" placeholder="${I18n.t('management.search')}" class="apple-input text-sm !py-1.5 !px-3 w-full sm:w-48" />`
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

    const currentFilters = getFilters();
    (currentFilters[tab] || []).forEach((f) => {
      const $sel = $(`<select data-filter="${f.name}" class="apple-input text-sm !py-1.5 !px-3 w-full sm:w-36"></select>`);
      $sel.append(`<option value="">${f.label}</option>`);
      f.options.forEach((o) => $sel.append(`<option value="${o}">${o}</option>`));
      if (f.freeText) {
        $sel.remove();
        const $input = $(
          `<input type="text" placeholder="${f.label}" class="apple-input text-sm !py-1.5 !px-3 w-full sm:w-36" />`
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
      $(`<button id="add-btn" class="ml-auto apple-btn apple-btn-primary !min-h-[36px] !py-1.5 !px-4 !text-sm">+ ${I18n.t('management.add')}</button>`).on(
        'click',
        () => openForm(null)
      )
    );
  }

  /* ---------------- create/edit form ---------------- */

  function openForm(item) {
    editingId = item ? item.id : null;
    $form.empty();

    const titleText = (editingId ? I18n.t('management.edit') : I18n.t('management.add')) + ' ' + (I18n.t('management.' + tab) || tab);
    $form.append($('<h3 class="text-lg font-semibold text-ink"></h3>').text(titleText));

    FIELDS[tab].forEach((f) => {
      const current = item ? item[f.name] : '';
      let $field;
      if (f.type === 'select') {
        $field = $(`<select name="${f.name}" class="apple-input w-full text-sm !py-2 !px-3"></select>`);
        f.options.forEach((o) => $field.append(`<option value="${o}">${o === '' ? '—' : o}</option>`));
        if (current !== undefined && current !== null) $field.val(String(current));
      } else if (f.type === 'number') {
        $field = $(`<input type="number" min="1" name="${f.name}" value="${current ?? ''}" class="apple-input w-full text-sm !py-2 !px-3" />`);
      } else {
        const val = Array.isArray(current) ? current.join(', ') : current ?? '';
        $field = $(`<input type="text" name="${f.name}" value="${String(val).replace(/"/g, '&quot;')}" class="apple-input w-full text-sm !py-2 !px-3" />`);
      }
      $form.append(
        $('<label class="block"><span class="apple-caption block mb-1">' + f.label + (f.required ? ' *' : '') + '</span></label>').append($field)
      );
    });

    $form.append(
      $('<div class="flex gap-2 pt-2"></div>')
        .append($(`<button type="submit" class="apple-btn apple-btn-primary flex-1 !min-h-[36px] !py-2">${I18n.t('management.save')}</button>`))
        .append($(`<button type="button" id="cancel-btn" class="apple-btn apple-btn-secondary flex-1 !min-h-[36px] !py-2">${I18n.t('management.cancel')}</button>`)
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
      showError(err.message || I18n.t('management.saveError'));
      $modal.addClass('hidden');
    }
  }

  async function updateUser(id, patch) {
    hideError();
    try {
      await api.put(`/api/users/${id}`, patch);
      load();
    } catch (err) {
      showError(err.message || I18n.t('management.saveError'));
    }
  }

  async function deleteItem(item) {
    hideError();
    let url = tab === 'users' ? `/api/users/${item.id}` : `/api/${tab}/${item.id}`;
    if (tab === 'users' && confirm(I18n.t('management.confirmDeleteUser', { name: item.username }))) {
      url += '?force=true';
    } else if (!confirm(I18n.t('management.confirmDelete'))) {
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
          showError(e2.message || I18n.t('management.deleteError'));
          return;
        }
      }
      showError(err.message || I18n.t('management.deleteError'));
    }
  }

  /* ---------------- tabs ---------------- */

  $('.tab-btn').on('click', function () {
    tab = $(this).data('tab');
    page = 1;
    $('.tab-btn')
      .removeClass('apple-btn-primary')
      .addClass('apple-btn-secondary');
    $(this).addClass('apple-btn-primary').removeClass('apple-btn-secondary');
    renderToolbar();
    load();
  });

  $(document).on('locale:changed', function () {
    I18n.apply();
    renderToolbar();
    load();
  });

  renderToolbar();
  load();
});
