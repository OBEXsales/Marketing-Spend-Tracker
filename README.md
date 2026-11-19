# Marketing Spend Tracker

A small local web app for tracking marketing spend and results across **Meta Ads** and **cold email (Salesforge + Mailforge)**.

There's nothing to install. Double-click `index.html` to open it in Chrome or Edge.

## What it does
- **Dashboard:** shows total, Meta and email spend, leads, CPL, reply rate, cost per meeting, cost per result and ROAS for any date range. It also has a spend-over-time chart, a channel split, and per-campaign and per-sequence tables.
- **Meta Ads:** pulls daily spend, impressions, clicks, leads and purchases per campaign from the Meta Marketing API. If you don't want to use the API, you can import an Ads Manager CSV instead.
- **Email:** add each Salesforge sequence with sent, opens, replies, positive replies, meetings, deals and revenue.
- **Expenses:** subscriptions and other costs. Mark Salesforge and Mailforge as **Monthly** and they're charged automatically every month.
- **Settings:** your Meta connection, your currency, and backup / restore.

## Where the data lives
Everything is saved in your browser's local storage, on this computer and in this browser only. It is not in Git.
- Go to **Settings → Download backup** regularly. Clearing your browser data will erase the tracker.
- To move to another computer, download a backup and use **Restore** there.
- Backup files are ignored by Git (`.gitignore`), so your numbers don't end up on GitHub.

## Connecting Meta
You need your **Ad Account ID** and an **access token** with the `ads_read` permission.

1. **Ad Account ID:** in Ads Manager, it's the number in the account dropdown or in the URL (`act=1234567890`).
2. **Token, quick version (expires in about 60 days):**
   1. Create an app at <https://developers.facebook.com/apps> (type: *Business*).
   2. Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/), select your app, add the `ads_read` permission, and click *Generate Access Token*.
   3. Use the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/) and click *Extend Access Token* to get the 60-day version.
3. **Token, long-lived version (recommended, doesn't expire):**
   1. In [Business Settings → Users → System users](https://business.facebook.com/settings/system-users), add a system user.
   2. Assign it your ad account with *View performance* access.
   3. Click *Generate new token* for your app with `ads_read`.
4. Paste both values into **Settings** and save.
5. On the **Meta Ads** tab, click **Sync selected range**.

The token is stored only in this browser. Don't commit it, paste it into files in this repo, or share backups that contain it (backups strip it automatically).

Syncing the same dates again updates the existing rows, so it never double-counts. Leads are taken from Meta's `lead` action, and purchases and revenue from `purchase`.

### CSV fallback
In Ads Manager:
1. Pick your columns.
2. Set **Breakdown → By time → Day**.
3. Export as CSV, then use **Import Ads Manager CSV**.

The CSV needs the *Day* (or *Reporting starts*), *Campaign name* and *Amount spent* columns.

## How the numbers are calculated
- **Meta spend** is the synced ad spend plus any Expenses entries with channel *Meta*, such as agency or creative fees.
- **Email spend** is the sum of the Expenses entries with channel *Email* in the range, including the monthly Salesforge and Mailforge charges.
- **Cost per meeting / per reply** is email spend divided by the meetings or replies from sequences that overlap the range.
- **Cost per result** is total spend divided by Meta leads + Meta purchases + positive email replies.
- **ROAS** is revenue (Meta purchase value + email revenue) divided by spend.

## Files
| File | Purpose |
|---|---|
| `index.html` | Layout and tabs |
| `css/styles.css` | Styles (light and dark mode) |
| `js/store.js` | Saving, loading, backup and restore |
| `js/metrics.js` | All the calculations |
| `js/meta.js` | Meta API sync and CSV import |
| `js/app.js` | UI, forms and charts |
