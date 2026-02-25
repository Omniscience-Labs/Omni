-- Grant for atomic_reset_expiring_credits (isolated due to Supabase CLI #4746)
GRANT EXECUTE ON FUNCTION public.atomic_reset_expiring_credits(UUID, NUMERIC, TEXT, TEXT) TO service_role;
