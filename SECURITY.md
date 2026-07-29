# Security and privacy

The public website retrieves only aggregated vote totals. It does not retrieve a list of voter names.

Supabase stores:

- First name
- Last name
- Anonymous browser user ID
- Selected dates
- Submission and selection timestamps

The tables have Row Level Security enabled, and direct access is revoked from browser roles. The browser can call only restricted database functions for aggregated totals, its own saved submission, and updating its own availability.

`config.js` may contain only a Supabase Publishable key or legacy anon key. Never commit a Secret key, `service_role` key, or database password.
