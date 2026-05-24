-- ─────────────────────────────────────────────────────────────────────────
-- 0020_lifecycle_state_extension
--
-- Hospital-registration-upgrade GATE A — extends the shared lifecycle
-- enum with five new values so the richer institution state machine
-- can be expressed end-to-end:
--
--   pending_approval (alias 'applied')
--     → under_review               (NEW)
--     → verified                   (existing)
--     → agreement_signed           (NEW; gate for activation)
--     → provisioning               (NEW; setup wizard)
--     → active                     (existing)
--
--   side states:
--     → offboarded                 (NEW; terminal, hospital-leaves-platform)
--     → agreement_expired          (NEW; renewal-required)
--
-- ALTER TYPE ... ADD VALUE cannot be wrapped in an outer transaction
-- with statements that USE the new value, and each ADD VALUE is its
-- own catalog mutation. Supabase CLI's per-migration transaction
-- is fine because this migration only adds values — it does not
-- reference them. IF NOT EXISTS is safe (and idempotent on re-run).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'under_review';
ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'agreement_signed';
ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'provisioning';
ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'offboarded';
ALTER TYPE public.lifecycle_state ADD VALUE IF NOT EXISTS 'agreement_expired';
