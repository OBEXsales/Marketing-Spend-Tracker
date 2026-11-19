/* Data storage: everything lives in localStorage under one key.
   Shapes:
   metaDaily:      {date, campaignId, campaignName, spend, impressions, clicks, leads, purchases, purchaseValue}
   emailCampaigns: {id, name, startDate, endDate, emailsSent, opens, replies, positiveReplies, meetingsBooked, dealsWon, revenue}
   expenses:       {id, date, channel: 'Meta'|'Email'|'Other', vendor, description, amount, recurring: 'monthly'|'none', endDate?}
   settings:       {metaAccountId, metaToken, metaApiVersion}
*/
(function () {
  var KEY = 'mst-data-v1';

  function empty() {
    return {
      version: 1,
      metaDaily: [],
      emailCampaigns: [],
      expenses: [],
      settings: { metaAccountId: '', metaToken: '', metaApiVersion: 'v23.0', currency: 'USD', lastSync: null }
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      var data = JSON.parse(raw);
      var base = empty();
      return {
        version: 1,
        metaDaily: Array.isArray(data.metaDaily) ? data.metaDaily : [],
        emailCampaigns: Array.isArray(data.emailCampaigns) ? data.emailCampaigns : [],
        expenses: Array.isArray(data.expenses) ? data.expenses : [],
        settings: Object.assign(base.settings, data.settings || {})
      };
    } catch (e) {
      console.warn('Could not read saved data', e);
      return empty();
    }
  }

  var state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Could not save data', e);
      alert('Could not save to browser storage. Download a backup from Settings so you don\'t lose data.');
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Insert or replace Meta rows keyed by date + campaignId. Returns {added, updated}. */
  function upsertMeta(rows) {
    var index = {};
    state.metaDaily.forEach(function (r, i) { index[r.date + '|' + r.campaignId] = i; });
    var added = 0, updated = 0;
    rows.forEach(function (r) {
      var k = r.date + '|' + r.campaignId;
      if (k in index) { state.metaDaily[index[k]] = r; updated++; }
      else { index[k] = state.metaDaily.length; state.metaDaily.push(r); added++; }
    });
    save();
    return { added: added, updated: updated };
  }

  function upsertById(listName, item) {
    var list = state[listName];
    if (!item.id) item.id = uid();
    var i = list.findIndex(function (x) { return x.id === item.id; });
    if (i >= 0) list[i] = item; else list.push(item);
    save();
    return item;
  }

  function removeById(listName, id) {
    state[listName] = state[listName].filter(function (x) { return x.id !== id; });
    save();
  }

  /* Backup excludes the Meta token so the file is safe to keep around. */
  function exportJSON() {
    var copy = JSON.parse(JSON.stringify(state));
    copy.settings.metaToken = '';
    copy.exportedAt = new Date().toISOString();
    return JSON.stringify(copy, null, 2);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !('expenses' in data || 'metaDaily' in data || 'emailCampaigns' in data)) {
      throw new Error('This file does not look like a tracker backup.');
    }
    var token = state.settings.metaToken;
    state = {
      version: 1,
      metaDaily: data.metaDaily || [],
      emailCampaigns: data.emailCampaigns || [],
      expenses: data.expenses || [],
      settings: Object.assign(empty().settings, data.settings || {})
    };
    if (!state.settings.metaToken) state.settings.metaToken = token;
    save();
  }

  function clearAll() {
    var settings = state.settings;
    state = empty();
    state.settings = settings;
    save();
  }

  window.Store = {
    get: function () { return state; },
    save: save,
    uid: uid,
    upsertMeta: upsertMeta,
    upsertById: upsertById,
    removeById: removeById,
    exportJSON: exportJSON,
    importJSON: importJSON,
    clearAll: clearAll
  };
})();
