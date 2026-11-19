/* UI: tabs, rendering, forms, charts. */
(function () {
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var M = window.Metrics;

  /* ---------- formatting ---------- */
  var moneyFmt;
  function setCurrency(code) {
    try {
      moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: code || 'USD' });
    } catch (e) {
      moneyFmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
  }
  function money(v) { return v == null || isNaN(v) ? '—' : moneyFmt.format(v); }
  function num(v) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString(); }
  function pct(v) { return v == null || isNaN(v) ? '—' : (v * 100).toFixed(v < 0.1 ? 2 : 1) + '%'; }
  function ratio(v) { return v == null || isNaN(v) ? '—' : v.toFixed(2) + '×'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  /* ---------- date range ---------- */
  var range = M.presetRange('last-30');
  function syncRangeInputs() { $('#rangeFrom').value = range.from; $('#rangeTo').value = range.to; }

  $('#rangePreset').addEventListener('change', function (e) {
    if (e.target.value !== 'custom') { range = M.presetRange(e.target.value); syncRangeInputs(); renderAll(); }
  });
  ['#rangeFrom', '#rangeTo'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var f = $('#rangeFrom').value, t = $('#rangeTo').value;
      if (!f || !t) return;
      if (f > t) { var x = f; f = t; t = x; }
      range = { from: f, to: t };
      $('#rangePreset').value = 'custom';
      syncRangeInputs();
      renderAll();
    });
  });

  /* ---------- tabs ---------- */
  function showTab(name) {
    $$('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    try { localStorage.setItem('mst-tab', name); } catch (e) { /* ignore */ }
  }
  $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]');
    if (g) { e.preventDefault(); showTab(g.dataset.goto); }
  });

  /* ---------- generic table ---------- */
  var sortState = {};
  function renderTable(table, columns, rows, opts) {
    opts = opts || {};
    var id = table.id;
    var s = sortState[id];
    if (s && table.classList.contains('sortable')) {
      var col = columns.find(function (c) { return c.key === s.key; });
      if (col) {
        rows = rows.slice().sort(function (a, b) {
          var x = a[s.key], y = b[s.key];
          if (x == null) return 1; if (y == null) return -1;
          var r = typeof x === 'string' ? x.localeCompare(y) : x - y;
          return s.dir === 'asc' ? r : -r;
        });
      }
    }
    var html = '<thead><tr>' + columns.map(function (c) {
      var dir = s && s.key === c.key ? ' data-dir="' + s.dir + '"' : '';
      return '<th data-key="' + c.key + '"' + dir + (c.text ? ' class="text"' : '') + '>' + esc(c.label) + '</th>';
    }).join('') + '</tr></thead><tbody>';
    if (!rows.length) {
      html += '<tr><td class="empty" colspan="' + columns.length + '">' + esc(opts.empty || 'Nothing here for this date range.') + '</td></tr>';
    } else {
      html += rows.map(function (r) {
        return '<tr>' + columns.map(function (c) {
          var v = c.render ? c.render(r) : (c.fmt ? c.fmt(r[c.key]) : esc(r[c.key]));
          return '<td' + (c.text ? ' class="text"' : '') + '>' + v + '</td>';
        }).join('') + '</tr>';
      }).join('');
    }
    html += '</tbody>';
    if (opts.footer && rows.length) {
      html += '<tfoot><tr>' + columns.map(function (c) {
        var v = opts.footer[c.key];
        return '<td' + (c.text ? ' class="text"' : '') + '>' + (v == null ? '' : (c.fmt && typeof v === 'number' ? c.fmt(v) : esc(v))) + '</td>';
      }).join('') + '</tr></tfoot>';
    }
    table.innerHTML = html;
  }
  document.addEventListener('click', function (e) {
    var th = e.target.closest('table.sortable th');
    if (!th) return;
    var id = th.closest('table').id, key = th.dataset.key;
    var cur = sortState[id];
    sortState[id] = { key: key, dir: cur && cur.key === key && cur.dir === 'desc' ? 'asc' : 'desc' };
    renderAll();
  });

  /* ---------- charts ---------- */
  var charts = {};
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function drawChart(key, canvas, config) {
    if (!window.Chart) {
      canvas.parentNode.innerHTML = '<div class="chart-fallback">Charts need an internet connection (Chart.js loads from a CDN).</div>';
      return;
    }
    if (charts[key]) charts[key].destroy();
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.borderColor = cssVar('--border');
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    charts[key] = new Chart(canvas, config);
  }

  /* ---------- column sets ---------- */
  var metaCols = [
    { key: 'campaignName', label: 'Campaign', text: true },
    { key: 'spend', label: 'Spend', fmt: money },
    { key: 'impressions', label: 'Impr.', fmt: num },
    { key: 'clicks', label: 'Clicks', fmt: num },
    { key: 'ctr', label: 'CTR', fmt: pct },
    { key: 'cpc', label: 'CPC', fmt: money },
    { key: 'cpm', label: 'CPM', fmt: money },
    { key: 'leads', label: 'Leads', fmt: num },
    { key: 'cpl', label: 'CPL', fmt: money },
    { key: 'purchases', label: 'Purch.', fmt: num },
    { key: 'cpa', label: 'CPA', fmt: money },
    { key: 'purchaseValue', label: 'Revenue', fmt: money },
    { key: 'roas', label: 'ROAS', fmt: ratio }
  ];

  function metaFooter(t) { return Object.assign({ campaignName: 'Total' }, t); }

  function emailRows(s) {
    return M.emailInRange(Store.get().emailCampaigns, s.range).map(function (c) {
      return Object.assign({}, c, M.campaignEmailStats(c));
    });
  }

  function emailCols(withActions) {
    var cols = [
      { key: 'name', label: 'Sequence', text: true },
      { key: 'startDate', label: 'Start', text: true },
      { key: 'endDate', label: 'End', text: true, render: function (r) { return r.endDate ? esc(r.endDate) : '<span class="tag">running</span>'; } },
      { key: 'emailsSent', label: 'Sent', fmt: num },
      { key: 'openRate', label: 'Open %', fmt: pct },
      { key: 'replies', label: 'Replies', fmt: num },
      { key: 'replyRate', label: 'Reply %', fmt: pct },
      { key: 'positiveReplies', label: 'Positive', fmt: num },
      { key: 'meetingsBooked', label: 'Meetings', fmt: num },
      { key: 'dealsWon', label: 'Deals', fmt: num },
      { key: 'revenue', label: 'Revenue', fmt: money }
    ];
    if (withActions) cols.push({ key: '_a', label: '', render: function (r) {
      return '<button class="link" data-action="edit-email" data-id="' + esc(r.id) + '">Edit</button>' +
             '<button class="link del" data-action="del-email" data-id="' + esc(r.id) + '">Delete</button>';
    } });
    return cols;
  }

  function emailFooter(t) {
    return {
      name: 'Total', emailsSent: t.emailsSent, openRate: t.openRate, replies: t.replies, replyRate: t.replyRate,
      positiveReplies: t.positiveReplies, meetingsBooked: t.meetingsBooked, dealsWon: t.dealsWon, revenue: t.revenue
    };
  }

  /* ---------- renderers ---------- */
  function renderKpis(s) {
    var e = s.email, m = s.meta;
    var tiles = [
      { label: 'Total spend', value: money(s.spend.total), detail: s.spend.other ? money(s.spend.other) + ' other' : 'all channels' },
      { cls: 'meta', label: 'Meta spend', value: money(s.spend.meta), detail: s.spend.metaOther ? money(s.spend.metaAds) + ' ads + ' + money(s.spend.metaOther) + ' fees' : 'ad spend' },
      { cls: 'meta', label: 'Meta leads · CPL', value: num(m.leads), detail: 'CPL ' + money(m.cpl) + ' · CTR ' + pct(m.ctr) },
      { cls: 'email', label: 'Email spend', value: money(s.spend.email), detail: 'Salesforge, Mailforge, domains' },
      { cls: 'email', label: 'Email replies', value: num(e.replies), detail: pct(e.replyRate) + ' reply rate · ' + num(e.positiveReplies) + ' positive' },
      { cls: 'email', label: 'Cost per meeting', value: money(e.costPerMeeting), detail: num(e.meetingsBooked) + ' meetings · ' + money(e.costPerPositive) + ' / positive reply' },
      { label: 'Cost per result', value: money(s.costPerResult), detail: num(s.results) + ' leads + purchases + positive replies' },
      { label: 'ROAS', value: ratio(s.roas), detail: money(s.revenue) + ' revenue' }
    ];
    $('#kpis').innerHTML = tiles.map(function (t) {
      return '<div class="kpi ' + (t.cls || '') + '"><div class="label">' + esc(t.label) + '</div><div class="value">' + t.value +
             '</div><div class="detail">' + esc(t.detail) + '</div></div>';
    }).join('');
  }

  function renderDashboard(s) {
    renderKpis(s);
    var ser = M.spendSeries(s);
    var colors = { Meta: cssVar('--meta'), Email: cssVar('--email'), Other: cssVar('--other') };
    drawChart('spend', $('#chartSpend'), {
      type: 'bar',
      data: {
        labels: ser.labels.map(function (l) { return ser.monthly ? l : l.slice(5); }),
        datasets: ['Meta', 'Email', 'Other'].map(function (k) {
          return { label: k, data: ser.series[k], backgroundColor: colors[k], stack: 's', borderRadius: 2 };
        })
      },
      options: {
        maintainAspectRatio: false, animation: false,
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: function (v) { return money(v); } } } },
        plugins: { tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + money(c.parsed.y); } } } }
      }
    });
    drawChart('channel', $('#chartChannel'), {
      type: 'doughnut',
      data: {
        labels: ['Meta', 'Email', 'Other'],
        datasets: [{ data: [s.spend.meta, s.spend.email, s.spend.other], backgroundColor: [colors.Meta, colors.Email, colors.Other], borderColor: cssVar('--surface') }]
      },
      options: {
        maintainAspectRatio: false, animation: false, cutout: '62%',
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return c.label + ': ' + money(c.parsed); } } } }
      }
    });
    renderTable($('#dashMetaTable'), metaCols, M.metaByCampaign(s.metaRows), { footer: metaFooter(s.meta), empty: 'No Meta data in this range. Sync from the Meta Ads tab.' });
    // Cost per meeting only exists for the total: subscriptions aren't split per sequence.
    var foot = emailFooter(s.email);
    renderTable($('#dashEmailTable'), emailCols(false).concat([{ key: 'costPerMeeting', label: 'Cost / meeting', fmt: money }]),
      emailRows(s), { footer: Object.assign(foot, { costPerMeeting: s.email.costPerMeeting }), empty: 'No email sequences in this range. Add them on the Email tab.' });
  }

  function renderMeta(s) {
    renderTable($('#metaTable'), metaCols, M.metaByCampaign(s.metaRows), { footer: metaFooter(s.meta), empty: 'No Meta data in this range yet.' });
    var daily = s.metaRows.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    renderTable($('#metaDailyTable'), [
      { key: 'date', label: 'Date', text: true },
      { key: 'campaignName', label: 'Campaign', text: true },
      { key: 'spend', label: 'Spend', fmt: money },
      { key: 'impressions', label: 'Impr.', fmt: num },
      { key: 'clicks', label: 'Clicks', fmt: num },
      { key: 'leads', label: 'Leads', fmt: num },
      { key: 'purchases', label: 'Purch.', fmt: num },
      { key: 'purchaseValue', label: 'Revenue', fmt: money }
    ], daily, { empty: 'No daily rows in this range.' });
    var ls = Store.get().settings.lastSync;
    $('#lastSync').textContent = ls ? 'Last sync: ' + new Date(ls).toLocaleString() : 'Not synced yet.';
  }

  function renderEmail(s) {
    var t = s.email;
    var cols = emailCols(true);
    var foot = emailFooter(t);
    renderTable($('#emailTable'), cols, emailRows(s), { footer: foot, empty: 'No sequences overlap this date range.' });
    if (emailRows(s).length) {
      $('#emailTable tfoot').insertAdjacentHTML('beforeend',
        '<tr><td colspan="' + cols.length + '" class="text">Email spend ' + money(t.spend) +
        ' · cost per reply ' + money(t.costPerReply) + ' · per positive reply ' + money(t.costPerPositive) +
        ' · per meeting ' + money(t.costPerMeeting) + ' · ROAS ' + ratio(t.roas) + '</td></tr>');
    }
  }

  function renderExpenses(s) {
    var charges = s.charges.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var total = charges.reduce(function (a, c) { return a + c.amount; }, 0);
    renderTable($('#chargesTable'), [
      { key: 'date', label: 'Date', text: true },
      { key: 'channel', label: 'Channel', text: true, render: function (r) { return '<span class="tag ' + esc(r.channel) + '">' + esc(r.channel) + '</span>'; } },
      { key: 'vendor', label: 'Vendor', text: true },
      { key: 'desc', label: 'Description', text: true, render: function (r) { return esc(r.expense.description) + (r.expense.recurring === 'monthly' ? ' <span class="tag">monthly</span>' : ''); } },
      { key: 'amount', label: 'Amount', fmt: money }
    ], charges, { footer: { date: 'Total', amount: total }, empty: 'No charges in this range.' });

    var all = Store.get().expenses.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    renderTable($('#expenseTable'), [
      { key: 'date', label: 'First charge', text: true },
      { key: 'channel', label: 'Channel', text: true, render: function (r) { return '<span class="tag ' + esc(r.channel) + '">' + esc(r.channel) + '</span>'; } },
      { key: 'vendor', label: 'Vendor', text: true },
      { key: 'description', label: 'Description', text: true },
      { key: 'recurring', label: 'Repeats', text: true, render: function (r) { return r.recurring === 'monthly' ? 'Monthly' + (r.endDate ? ' until ' + esc(r.endDate) : '') : 'One-off'; } },
      { key: 'amount', label: 'Amount', fmt: money },
      { key: '_a', label: '', render: function (r) {
        return '<button class="link" data-action="edit-expense" data-id="' + esc(r.id) + '">Edit</button>' +
               '<button class="link del" data-action="del-expense" data-id="' + esc(r.id) + '">Delete</button>';
      } }
    ], all, { empty: 'No expenses yet. Add your Salesforge and Mailforge subscriptions above.' });
  }

  function renderAll() {
    var s = M.summary(Store.get(), range);
    renderDashboard(s);
    renderMeta(s);
    renderEmail(s);
    renderExpenses(s);
  }

  /* ---------- forms ---------- */
  function formData(form) {
    var o = {};
    new FormData(form).forEach(function (v, k) { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  }
  function fillForm(form, obj) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name && el.name in obj) el.value = obj[el.name] == null ? '' : obj[el.name];
    });
  }

  // Email sequences
  var emailForm = $('#emailForm');
  var EMAIL_NUMS = ['emailsSent', 'opens', 'replies', 'positiveReplies', 'meetingsBooked', 'dealsWon', 'revenue'];
  function resetEmailForm() {
    emailForm.reset();
    emailForm.elements.id.value = '';
    emailForm.elements.startDate.value = M.today();
    $('#emailFormTitle').textContent = 'Add email sequence';
    $('#emailCancel').hidden = true;
  }
  emailForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = formData(emailForm);
    EMAIL_NUMS.forEach(function (k) { d[k] = Number(d[k]) || 0; });
    if (d.endDate && d.endDate < d.startDate) { toast('End date is before the start date.'); return; }
    if (d.replies > d.emailsSent || d.positiveReplies > d.replies) { toast('Check the numbers: replies can’t exceed sent, positive can’t exceed replies.'); return; }
    if (!d.endDate) d.endDate = '';
    Store.upsertById('emailCampaigns', d);
    resetEmailForm();
    renderAll();
    toast('Sequence saved');
  });
  $('#emailCancel').addEventListener('click', resetEmailForm);

  // Expenses
  var expenseForm = $('#expenseForm');
  function resetExpenseForm() {
    expenseForm.reset();
    expenseForm.elements.id.value = '';
    expenseForm.elements.date.value = M.today();
    $('#expenseFormTitle').textContent = 'Add expense';
    $('#expenseCancel').hidden = true;
  }
  expenseForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = formData(expenseForm);
    d.amount = Number(d.amount) || 0;
    if (d.recurring !== 'monthly') d.endDate = '';
    if (d.endDate && d.endDate < d.date) { toast('End date is before the first charge.'); return; }
    Store.upsertById('expenses', d);
    resetExpenseForm();
    renderAll();
    toast('Expense saved');
  });
  $('#expenseCancel').addEventListener('click', resetExpenseForm);

  // Edit / delete buttons
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-action]');
    if (!b) return;
    var id = b.dataset.id, data = Store.get();
    if (b.dataset.action === 'edit-email') {
      fillForm(emailForm, data.emailCampaigns.find(function (x) { return x.id === id; }) || {});
      $('#emailFormTitle').textContent = 'Edit email sequence';
      $('#emailCancel').hidden = false;
      emailForm.scrollIntoView({ behavior: 'smooth' });
    } else if (b.dataset.action === 'del-email') {
      if (confirm('Delete this sequence?')) { Store.removeById('emailCampaigns', id); renderAll(); }
    } else if (b.dataset.action === 'edit-expense') {
      fillForm(expenseForm, data.expenses.find(function (x) { return x.id === id; }) || {});
      $('#expenseFormTitle').textContent = 'Edit expense';
      $('#expenseCancel').hidden = false;
      expenseForm.scrollIntoView({ behavior: 'smooth' });
    } else if (b.dataset.action === 'del-expense') {
      if (confirm('Delete this expense (and all its monthly charges)?')) { Store.removeById('expenses', id); renderAll(); }
    }
  });

  // Settings
  var settingsForm = $('#settingsForm');
  settingsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = formData(settingsForm);
    var st = Store.get().settings;
    st.metaAccountId = d.metaAccountId;
    st.metaApiVersion = d.metaApiVersion || 'v23.0';
    st.metaToken = d.metaToken;
    st.currency = (d.currency || 'USD').toUpperCase();
    Store.save();
    setCurrency(st.currency);
    renderAll();
    var s = $('#settingsStatus'); s.textContent = 'Saved'; s.className = 'status ok';
  });

  /* ---------- Meta sync & CSV ---------- */
  function setSync(msg, cls) { var s = $('#syncStatus'); s.textContent = msg; s.className = 'status ' + (cls || ''); }

  $('#btnSync').addEventListener('click', async function () {
    var st = Store.get().settings;
    var btn = this;
    btn.disabled = true;
    setSync('Syncing…');
    try {
      var rows = await Meta.fetchInsights({
        accountId: st.metaAccountId, token: st.metaToken, version: st.metaApiVersion, from: range.from, to: range.to
      }, null, function (p, n) { setSync('Syncing… page ' + p + ', ' + n + ' rows'); });
      var r = Store.upsertMeta(rows);
      st.lastSync = new Date().toISOString();
      Store.save();
      setSync('Done: ' + r.added + ' new, ' + r.updated + ' updated rows.', 'ok');
      renderAll();
    } catch (err) {
      setSync(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  function readFile(input, cb) {
    var f = input.files && input.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { cb(String(reader.result)); input.value = ''; };
    reader.onerror = function () { toast('Could not read the file.'); input.value = ''; };
    reader.readAsText(f);
  }

  $('#metaCsv').addEventListener('change', function () {
    readFile(this, function (text) {
      try {
        var r = Store.upsertMeta(Meta.importCSV(text));
        setSync('CSV imported: ' + r.added + ' new, ' + r.updated + ' updated rows.', 'ok');
        renderAll();
      } catch (err) { setSync(err.message, 'error'); }
    });
  });

  $('#btnClearMetaRange').addEventListener('click', function () {
    var data = Store.get();
    var n = data.metaDaily.filter(function (x) { return M.inRange(x.date, range); }).length;
    if (!n) { toast('No Meta rows in this range.'); return; }
    if (!confirm('Delete ' + n + ' Meta rows from ' + range.from + ' to ' + range.to + '? You can sync them again later.')) return;
    data.metaDaily = data.metaDaily.filter(function (x) { return !M.inRange(x.date, range); });
    Store.save();
    renderAll();
  });

  /* ---------- backup / restore ---------- */
  $('#btnBackup').addEventListener('click', function () {
    var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'marketing-spend-backup-' + M.today() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('#restoreFile').addEventListener('change', function () {
    readFile(this, function (text) {
      try {
        if (!confirm('Replace all current data with this backup?')) return;
        Store.importJSON(text);
        loadSettingsForm();
        renderAll();
        toast('Backup restored');
      } catch (err) { toast('Restore failed: ' + err.message); }
    });
  });
  $('#btnClearAll').addEventListener('click', function () {
    if (!confirm('Delete ALL Meta rows, email sequences and expenses? Download a backup first if you might need them. This cannot be undone.')) return;
    Store.clearAll();
    renderAll();
    toast('All data deleted');
  });

  /* ---------- init ---------- */
  function loadSettingsForm() {
    var st = Store.get().settings;
    fillForm(settingsForm, st);
    setCurrency(st.currency);
  }

  loadSettingsForm();
  syncRangeInputs();
  resetEmailForm();
  resetExpenseForm();
  try { var tab = localStorage.getItem('mst-tab'); if (tab && $('#tab-' + tab)) showTab(tab); } catch (e) { /* ignore */ }
  renderAll();
})();
