# Votee Night Play

A GitHub Pages website for coordinating evening games at Milton A. Votee Park in Teaneck, New Jersey.

## Current behavior

- Shows weather for 8 PM, 9 PM, 10 PM, and 11 PM.
- Displays the next seven calendar days while excluding Friday evening.
- Allows each person to select multiple available nights.
- Collects first name and last name privately.
- Saves selected nights and the submission timestamp in Supabase.
- Shows only numerical vote totals publicly. Names are never returned to the public website.
- Allows the same browser to update its saved submission.

## Required setup

1. Create a Supabase project.
2. Enable Anonymous Sign-Ins in Supabase Authentication.
3. Run `database.sql` in the Supabase SQL Editor.
4. Put the Supabase Project URL and Publishable key in `config.js`.
5. Commit and push the files to GitHub.
6. Publish from `main` and `/(root)` under **Settings → Pages**.

See `docs/DEPLOYMENT.md` for detailed instructions.

## Organizer data

In Supabase, open **Table Editor → admin_vote_details** to see first name, last name, selected date, and voting timestamps. Browser roles have no permission to query that view.

## Security

Use only a Supabase Publishable key or legacy anon key in `config.js`. Never place a Secret or `service_role` key in GitHub.
