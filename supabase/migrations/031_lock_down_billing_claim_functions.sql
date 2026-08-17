-- 031_lock_down_billing_claim_functions.sql
-- Take the billing queue away from `anon`.
--
-- The three `claim_*` functions are the billing cron's work-queue: each one
-- SELECTs the subscriptions that are due and, in the same statement, clears the
-- field that made them due (`next_billing_date` / `phase_ends_at`) so two cron
-- runs cannot charge the same person twice.
--
-- They were created without an explicit grant, so they inherited Supabase's
-- default `EXECUTE` for `anon` and `authenticated` — and the anon key is public
-- by design (it ships in the browser bundle). That made two things true for
-- anyone at all:
--
--   1. READ — `claim_due_subscriptions` returns `rec_token`, the WayForPay
--      recurring-charge token, alongside `client_email`, `client_phone` and
--      `plan_price`. `claim_trial_billing_batch` returns the same tokens.
--
--   2. WRITE — calling it NULLs `next_billing_date` on every row it claims. The
--      cron selects on `next_billing_date <= now()`, so a claimed row is never
--      billed again. One unauthenticated request could silently drain the
--      billing queue, and nothing would look broken until the money stopped.
--
-- The only caller is app/api/cron/billing/route.ts, which goes through
-- `createServiceRoleClient()` — so `service_role` keeps its grant and the cron is
-- unaffected. Nothing in the app calls these from the browser.
--
-- Deliberately NOT touched here:
--   • `handle_new_user_subscription()` — a real trigger function. PostgREST
--     cannot usefully call it (a trigger function rejects a plain call), and
--     revoking risks the signup trigger. Flagged, not changed.
--   • `ruta_waitlist_*` — the public landing page calls those as anon on purpose.

revoke execute on function public.claim_due_subscriptions(integer) from anon, authenticated;
revoke execute on function public.claim_trial_billing_batch(integer) from anon, authenticated;
revoke execute on function public.claim_discounted_price_change_batch(integer) from anon, authenticated;

notify pgrst, 'reload schema';
