# Deployment and update instructions

## 1. Create or open the Supabase project

Create a project in the Supabase dashboard and wait for it to finish provisioning.

## 2. Enable Anonymous Sign-Ins

Open **Authentication → Sign In / Providers → Anonymous** and enable Anonymous Sign-Ins.

The website uses anonymous authentication to associate a saved submission with one browser without requiring an account.

## 3. Install or upgrade the database

Open **SQL Editor → New query**, paste the entire contents of `database.sql`, and click **Run**.

The updated SQL replaces the earlier one-night schema. It clears old test votes and creates:

- `voter_submissions`
- `vote_choices`
- `admin_vote_details`
- `get_vote_summary()`
- `get_my_submission()`
- `submit_availability()`

## 4. Configure `config.js`

In Supabase, copy the **Project URL** and **Publishable key** from the project's Connect/API Keys area.

Edit `config.js`:

```javascript
window.VOTEE_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_REPLACE_ME"
};
```

Replace both placeholders. A legacy `anon` key also works. Never use a Secret or `service_role` key.

## 5. Upload the website update

Replace the old repository files with this package, commit the changes, and push to `main`.

GitHub Pages should be configured under **Settings → Pages** as:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/(root)`

## 6. Verify

Open the GitHub Pages URL in a private/incognito window and confirm:

- Weather loads.
- Friday is excluded.
- Multiple nights can be selected.
- First and last name are required.
- Vote totals update after saving.
- No names appear publicly.

## 7. View organizer details

In Supabase, open **Table Editor → admin_vote_details**. It displays the private organizer report with names, dates, and timestamps.

## Troubleshooting

### “Voting is not connected”

`config.js` still contains placeholders or the edited file has not been pushed to GitHub.

### “Anonymous Sign-Ins must be enabled”

Enable the Anonymous provider in Supabase Authentication.

### “The updated database.sql has not been run”

Run the latest `database.sql` in the Supabase SQL Editor.

### Website still shows the previous version

Confirm the GitHub Pages deployment is complete under the repository's **Actions** tab, then refresh with Ctrl+F5.
