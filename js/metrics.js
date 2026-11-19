/* Pure calculations: date helpers, expense expansion and KPI math. */
(function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { return iso(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }

  function presetRange(name) {
    var now = new Date();
    if (name === 'this-month') {
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today() };
    }
    if (name === 'last-month') {
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0))
      };
    }
    if (name === 'last-90') return { from: addDays(today(), -89), to: today() };
    if (name === 'this-year') return { from: now.getFullYear() + '-01-01', to: today() };
    return { from: addDays(today(), -29), to: today() }; // last-30
  }

  function inRange(date, r) { return date >= r.from && date <= r.to; }

  /* Turn expenses into dated charges inside the range.
     A monthly expense charges on the same day each month (clamped to month end)
     from its start date until its end date (if any) or the range end. */
  function expenseCharges(expenses, r) {
    var out = [];
    expenses.forEach(function (e) {
      var amount = Number(e.amount) || 0;
      if (e.recurring !== 'monthly') {
        if (inRange(e.date, r)) out.push({ date: e.date, channel: e.channel, vendor: e.vendor, amount: amount, expense: e });
        return;
      }
      var start = parse(e.date);
      var day = start.getDate();
      var stop = e.endDate && e.endDate < r.to ? e.endDate : r.to;
      for (var m = 0; m < 600; m++) {
        var y = start.getFullYear(), mo = start.getMonth() + m;
        var last = new Date(y, mo + 1, 0).getDate();
        var d = iso(new Date(y, mo, Math.min(day, last)));
        if (d > stop) break;
        if (d >= r.from) out.push({ date: d, channel: e.channel, vendor: e.vendor, amount: amount, expense: e });
      }
    });
    return out;
  }

  function div(a, b) { return b ? a / b : null; }

  function sumMeta(rows) {
    var t = { spend: 0, impressions: 0, clicks: 0, leads: 0, purchases: 0, purchaseValue: 0 };
    rows.forEach(function (r) {
      t.spend += +r.spend || 0; t.impressions += +r.impressions || 0; t.clicks += +r.clicks || 0;
      t.leads += +r.leads || 0; t.purchases += +r.purchases || 0; t.purchaseValue += +r.purchaseValue || 0;
    });
    t.ctr = div(t.clicks, t.impressions);
    t.cpc = div(t.spend, t.clicks);
    t.cpm = t.impressions ? t.spend / t.impressions * 1000 : null;
    t.cpl = div(t.spend, t.leads);
    t.cpa = div(t.spend, t.purchases);
    t.roas = t.purchaseValue ? div(t.purchaseValue, t.spend) : null;
    return t;
  }

  /* Meta rows grouped by campaign, each with its own totals. */
  function metaByCampaign(rows) {
    var groups = {};
    rows.forEach(function (r) {
      (groups[r.campaignId] = groups[r.campaignId] || { campaignId: r.campaignId, campaignName: r.campaignName, rows: [] }).rows.push(r);
      groups[r.campaignId].campaignName = r.campaignName || groups[r.campaignId].campaignName;
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      return Object.assign({ campaignId: g.campaignId, campaignName: g.campaignName }, sumMeta(g.rows));
    });
  }

  /* Email sequences that overlap the range. */
  function emailInRange(campaigns, r) {
    return campaigns.filter(function (c) {
      var end = c.endDate || '9999-12-31';
      return c.startDate <= r.to && end >= r.from;
    });
  }

  function sumEmail(campaigns, emailSpend) {
    var t = { emailsSent: 0, opens: 0, replies: 0, positiveReplies: 0, meetingsBooked: 0, dealsWon: 0, revenue: 0 };
    campaigns.forEach(function (c) { Object.keys(t).forEach(function (k) { t[k] += +c[k] || 0; }); });
    t.openRate = div(t.opens, t.emailsSent);
    t.replyRate = div(t.replies, t.emailsSent);
    t.positiveRate = div(t.positiveReplies, t.replies);
    t.spend = emailSpend;
    t.costPerReply = div(emailSpend, t.replies);
    t.costPerPositive = div(emailSpend, t.positiveReplies);
    t.costPerMeeting = div(emailSpend, t.meetingsBooked);
    t.roas = t.revenue ? div(t.revenue, emailSpend) : null;
    return t;
  }

  function campaignEmailStats(c) {
    return {
      openRate: div(+c.opens || 0, +c.emailsSent || 0),
      replyRate: div(+c.replies || 0, +c.emailsSent || 0),
      positiveRate: div(+c.positiveReplies || 0, +c.replies || 0)
    };
  }

  /* Everything the dashboard needs for a range. */
  function summary(data, r) {
    var metaRows = data.metaDaily.filter(function (x) { return inRange(x.date, r); });
    var charges = expenseCharges(data.expenses, r);
    var byChannel = { Meta: 0, Email: 0, Other: 0 };
    charges.forEach(function (c) { byChannel[c.channel] = (byChannel[c.channel] || 0) + c.amount; });

    var meta = sumMeta(metaRows);
    var email = sumEmail(emailInRange(data.emailCampaigns, r), byChannel.Email);

    var metaTotal = meta.spend + byChannel.Meta;
    var total = metaTotal + byChannel.Email + byChannel.Other;
    var results = meta.leads + meta.purchases + email.positiveReplies;
    var revenue = meta.purchaseValue + email.revenue;

    return {
      range: r,
      metaRows: metaRows,
      charges: charges,
      meta: meta,
      email: email,
      spend: { metaAds: meta.spend, metaOther: byChannel.Meta, meta: metaTotal, email: byChannel.Email, other: byChannel.Other, total: total },
      results: results,
      costPerResult: div(total, results),
      revenue: revenue,
      roas: revenue ? div(revenue, total) : null
    };
  }

  /* Daily or monthly buckets of spend per channel for the time chart. */
  function spendSeries(s) {
    var r = s.range;
    var days = Math.round((parse(r.to) - parse(r.from)) / 86400000) + 1;
    var monthly = days > 92;
    function bucket(d) { return monthly ? d.slice(0, 7) : d; }
    var labels = [];
    if (monthly) {
      var d = parse(r.from); d.setDate(1);
      while (iso(d).slice(0, 7) <= r.to.slice(0, 7)) { labels.push(iso(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); }
    } else {
      for (var i = 0; i < days; i++) labels.push(addDays(r.from, i));
    }
    var idx = {}; labels.forEach(function (l, i) { idx[l] = i; });
    var series = { Meta: labels.map(function () { return 0; }), Email: labels.map(function () { return 0; }), Other: labels.map(function () { return 0; }) };
    s.metaRows.forEach(function (x) { var i = idx[bucket(x.date)]; if (i != null) series.Meta[i] += +x.spend || 0; });
    s.charges.forEach(function (c) { var i = idx[bucket(c.date)]; if (i != null) series[c.channel][i] += c.amount; });
    return { labels: labels, series: series, monthly: monthly };
  }

  window.Metrics = {
    iso: iso, today: today, addDays: addDays, presetRange: presetRange, inRange: inRange,
    expenseCharges: expenseCharges, sumMeta: sumMeta, metaByCampaign: metaByCampaign,
    emailInRange: emailInRange, sumEmail: sumEmail, campaignEmailStats: campaignEmailStats,
    summary: summary, spendSeries: spendSeries
  };
})();
