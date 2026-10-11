-- 0106 — Alert delivery and the escalation scheduler (Lab Phase 1, ADRs 0242, 0244; gate-a-proposal §6;
-- D-LAB1-27; E-LAB1-04, -05).
--
--   1. A private realtime topic per user, `user:<id>`: only that signed-in user may receive on it. Payloads
--      carry `{alertId, kind, at}` and nothing about the patient (MS-4, Law 7). private.notify_user sends.
--   2. The scheduler: pg_cron + pg_net, created only where the extensions are available (Supabase; the
--      PGlite lane skips them). private.schedule_lab_escalations(url) — run once by the owner after this
--      migration — schedules a call every minute to /api/cron/lab-escalations with the bearer secret read
--      from Vault (`medsync_cron_secret`, the same value as the app's CRON_SECRET). The app also escalates
--      lazily on every read of alerts, and records a heartbeat each run (ES-3, ES-5).
--
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0106`), then:
--   select vault.create_secret('<CRON_SECRET>', 'medsync_cron_secret');
--   select private.schedule_lab_escalations('https://<host>/api/cron/lab-escalations');

-- ─── 1. The per-user topic ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.notify_user(p_user uuid, p_kind text, p_alert uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF to_regproc('realtime.send') IS NULL THEN RETURN; END IF;
  PERFORM realtime.send(
    jsonb_build_object('alertId', p_alert, 'kind', p_kind, 'at', now()),
    'critical',
    'user:' || p_user::text,
    true);
END;
$$;
REVOKE ALL ON FUNCTION private.notify_user(uuid, text, uuid) FROM PUBLIC;

DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS user_realtime_receive ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY user_realtime_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          realtime.messages.extension = 'broadcast'
          AND (SELECT realtime.topic()) = 'user:' || (SELECT auth.uid())::text
        )
    $p$;
  END IF;
END
$do$;

-- ─── 2. The scheduler (where available) ──────────────────────────────────
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION private.schedule_lab_escalations(p_url text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_url IS NULL OR p_url !~ '^https://[^ ]+/api/cron/lab-escalations$' THEN
    RAISE EXCEPTION 'schedule_lab_escalations: give the https URL of /api/cron/lab-escalations';
  END IF;
  IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL OR to_regnamespace('vault') IS NULL THEN
    RAISE EXCEPTION 'schedule_lab_escalations: pg_cron, pg_net and Vault are required';
  END IF;
  EXECUTE format($sql$
    SELECT cron.schedule('medsync-lab-escalations', '* * * * *', %L)
  $sql$, format($job$
    SELECT net.http_post(
      url := %L,
      headers := jsonb_build_object('Authorization', 'Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'medsync_cron_secret')),
      body := '{}'::jsonb)
  $job$, p_url));
  RETURN 'scheduled every minute: ' || p_url;
END;
$$;
REVOKE ALL ON FUNCTION private.schedule_lab_escalations(text) FROM PUBLIC;
