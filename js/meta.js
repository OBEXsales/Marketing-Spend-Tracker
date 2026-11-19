/* Meta Marketing API sync and Ads Manager CSV import. */
(function () {
  // Meta reports the same conversion under several action types; take the first one present
  // in each list so a lead is not counted twice.
  var LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped'];
  var PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'];

  function pickAction(list, types) {
    if (!Array.isArray(list)) return 0;
    for (var i = 0; i < types.length; i++) {
      var hit = list.find(function (a) { return a.action_type === types[i]; });
      if (hit) return Number(hit.value) || 0;
    }
    return 0;
  }

  function toRow(x) {
    return {
      date: x.date_start,
      campaignId: String(x.campaign_id),
      campaignName: x.campaign_name || String(x.campaign_id),
      spend: Number(x.spend) || 0,
      impressions: Number(x.impressions) || 0,
      clicks: Number(x.clicks) || 0,
      leads: pickAction(x.actions, LEAD_TYPES),
      purchases: pickAction(x.actions, PURCHASE_TYPES),
      purchaseValue: pickAction(x.action_values, PURCHASE_TYPES)
    };
  }

  function friendlyError(err) {
    if (!err) return 'Unknown error from Meta.';
    if (err.code === 190) return 'Your Meta access token is invalid or expired. Create a new one and paste it in Settings.';
    if (err.code === 100) return 'Meta rejected the request: ' + err.message + ' Check the Ad Account ID (digits only, or act_ followed by digits).';
    if (err.code === 200 || err.code === 10) return 'The token lacks permission for this ad account. It needs the ads_read permission. (' + err.message + ')';
    if (err.code === 17 || err.code === 4 || err.code === 80000) return 'Meta rate limit hit. Wait a few minutes and sync again.';
    return err.message || JSON.stringify(err);
  }

  /* fetchImpl lets tests pass a stub. onProgress(pageCount, rowCount). */
  async function fetchInsights(opts, fetchImpl, onProgress) {
    fetchImpl = fetchImpl || window.fetch.bind(window);
    var id = String(opts.accountId || '').trim().replace(/^act_/, '');
    if (!/^\d+$/.test(id)) throw new Error('Ad Account ID should be digits, like 1234567890 (or act_1234567890).');
    if (!opts.token) throw new Error('Add your Meta access token in Settings first.');

    var params = new URLSearchParams({
      level: 'campaign',
      time_increment: '1',
      time_range: JSON.stringify({ since: opts.from, until: opts.to }),
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions,action_values',
      limit: '500',
      access_token: opts.token
    });
    var url = 'https://graph.facebook.com/' + (opts.version || 'v23.0') + '/act_' + id + '/insights?' + params.toString();

    var rows = [], pages = 0;
    while (url) {
      var res, body;
      try {
        res = await fetchImpl(url);
        body = await res.json();
      } catch (e) {
        throw new Error('Could not reach Meta (' + e.message + '). Check your internet connection.');
      }
      if (body.error) throw new Error(friendlyError(body.error));
      (body.data || []).forEach(function (x) { rows.push(toRow(x)); });
      pages++;
      if (onProgress) onProgress(pages, rows.length);
      url = body.paging && body.paging.next ? body.paging.next : null;
      if (pages > 200) break; // safety stop
    }
    return rows;
  }

  /* ---------- CSV import (Ads Manager export) ---------- */

  function parseCSV(text) {
    var rows = [], row = [], field = '', q = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function findCol(headers, patterns) {
    for (var p = 0; p < patterns.length; p++) {
      for (var i = 0; i < headers.length; i++) {
        if (patterns[p].test(headers[i])) return i;
      }
    }
    return -1;
  }

  function num(v) {
    if (v == null) return 0;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  /* Expects one row per campaign per day (Ads Manager: Breakdown > By time > Day). */
  function importCSV(text) {
    var table = parseCSV(text);
    if (table.length < 2) throw new Error('The CSV file is empty.');
    var h = table[0].map(function (s) { return s.trim().toLowerCase(); });
    var col = {
      date: findCol(h, [/^day$/, /^date$/, /^reporting starts$/]),
      id: findCol(h, [/^campaign id$/]),
      name: findCol(h, [/^campaign name$/, /^campaign$/]),
      spend: findCol(h, [/^amount spent/, /^spend/]),
      impressions: findCol(h, [/^impressions$/]),
      clicks: findCol(h, [/^link clicks$/, /^clicks \(all\)$/, /^clicks$/]),
      leads: findCol(h, [/^leads$/, /^leads \(form\)$/, /^website leads$/]),
      purchases: findCol(h, [/^purchases$/, /^website purchases$/]),
      value: findCol(h, [/^purchases conversion value$/, /^website purchases conversion value$/, /conversion value/])
    };
    if (col.date < 0 || col.name < 0 || col.spend < 0) {
      throw new Error('Could not find the Day / Reporting starts, Campaign name and Amount spent columns. Export from Ads Manager with Breakdown → By time → Day.');
    }
    var out = [];
    table.slice(1).forEach(function (r) {
      var date = (r[col.date] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return; // skips totals rows
      var name = (r[col.name] || '').trim();
      out.push({
        date: date,
        campaignId: col.id >= 0 && r[col.id] ? r[col.id].trim() : 'name:' + name,
        campaignName: name,
        spend: num(r[col.spend]),
        impressions: col.impressions >= 0 ? num(r[col.impressions]) : 0,
        clicks: col.clicks >= 0 ? num(r[col.clicks]) : 0,
        leads: col.leads >= 0 ? num(r[col.leads]) : 0,
        purchases: col.purchases >= 0 ? num(r[col.purchases]) : 0,
        purchaseValue: col.value >= 0 ? num(r[col.value]) : 0
      });
    });
    if (!out.length) throw new Error('No daily rows found. Dates must look like 2026-11-19.');
    return out;
  }

  window.Meta = { fetchInsights: fetchInsights, toRow: toRow, importCSV: importCSV, parseCSV: parseCSV };
})();
