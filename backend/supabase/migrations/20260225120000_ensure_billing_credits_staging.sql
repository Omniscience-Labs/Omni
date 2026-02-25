-- Combined idempotent migration for DBs that missed earlier billing/credits migrations (e.g. staging).
-- 1) credit_ledger.stripe_event_id – fixes PGRST204 when inserting ledger rows.
-- 2) atomic_reset_expiring_credits – in separate migrations (20260225120001, 20260225120002)
--    due to Supabase CLI bug #4746: "atomic" in identifiers breaks the parser.

-- ---------------------------------------------------------------------------
-- 1. Ensure credit_ledger has stripe_event_id (original: 20251013131022)
-- ---------------------------------------------------------------------------
ALTER TABLE public.credit_ledger
ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.credit_ledger'::regclass
        AND conname = 'unique_stripe_event'
    ) THEN
        ALTER TABLE public.credit_ledger
        ADD CONSTRAINT unique_stripe_event UNIQUE (stripe_event_id);
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_credit_ledger_stripe_event
ON public.credit_ledger (stripe_event_id)
WHERE stripe_event_id IS NOT NULL;
