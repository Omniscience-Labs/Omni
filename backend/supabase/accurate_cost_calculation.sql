-- =====================================================
-- ACCURATE COST CALCULATION FROM MESSAGES TABLE
-- Uses messages table as source of truth for all token data
-- Matches Anthropic pricing and cache handling logic
-- 
-- PERFORMANCE NOTE: For better performance with large datasets (85k+ rows),
-- consider creating this index:
-- CREATE INDEX IF NOT EXISTS idx_messages_type_created_at 
--   ON messages(type, created_at) 
--   WHERE type = 'assistant_response_end';
-- =====================================================

WITH params AS (
  SELECT
    1.20::numeric AS margin_mult,  -- Your margin multiplier (from billing/config.py)
    
    -- Date range filter (change these dates as needed)
    -- Format: 'YYYY-MM-DD' (inclusive start, exclusive end - so end date is actually the day after)
    '2024-11-01'::date AS start_date,      -- Start date (inclusive)
    '2024-11-19'::date AS end_date,        -- End date (exclusive, so Nov 19 means up to Nov 18 23:59:59)
    
    -- Model pricing per million tokens
    -- Haiku 4.5 (using 2.5 to match old query, registry shows 2.40)
    2.5::numeric AS haiku_input_per_m,
    12.00::numeric AS haiku_output_per_m,
    
    -- Sonnet 4
    4.50::numeric AS sonnet4_input_per_m,
    22.50::numeric AS sonnet4_output_per_m,
    
    -- Other Sonnet (3.7, 3.5)
    3.00::numeric AS sonnet_other_input_per_m,
    15.00::numeric AS sonnet_other_output_per_m,
    
    -- Opus
    15.00::numeric AS opus_input_per_m,
    75.00::numeric AS opus_output_per_m,
    
    -- Long-context multipliers for Sonnet-4 (when effective input > 200k)
    2.0::numeric AS sonnet4_input_long_mult,      -- input rate ×2
    1.5::numeric AS sonnet4_output_long_mult,    -- output rate ×1.5
    2.0::numeric AS sonnet4_cache_long_mult,      -- cache read/write ×2
    
    -- Fixed cache pricing for Sonnet-4 (per million tokens)
    0.30::numeric AS sonnet4_cache_read_per_m_usd,
    3.75::numeric AS sonnet4_cache_write_per_m_usd,
    
    -- Cache discounts (from billing_integration.py) - used for non-Sonnet-4 models
    0.10::numeric AS anthropic_cache_read_discount,  -- 90% discount (10% of normal cost)
    1.00::numeric AS cache_creation_multiplier       -- Full cost for cache creation
),

-- Extract all usage data from messages table
-- OPTIMIZED: Apply date filter first with literal values (no CROSS JOIN), then filter by type
message_usage AS (
  SELECT 
    m.message_id,
    m.thread_id,
    m.created_at,
    t.account_id,
    m.content->>'model' AS model,
    
    -- Extract token counts
    COALESCE((m.content->'usage'->>'prompt_tokens')::int, 0) AS prompt_tokens,
    COALESCE((m.content->'usage'->>'completion_tokens')::int, 0) AS completion_tokens,
    COALESCE((m.content->'usage'->>'cache_read_input_tokens')::int, 0) AS cache_read_tokens,
    COALESCE((m.content->'usage'->>'cache_creation_input_tokens')::int, 0) AS cache_creation_tokens,
    
    -- Calculate effective input (for long-context detection if needed)
    (COALESCE((m.content->'usage'->>'prompt_tokens')::int, 0)
     + COALESCE((m.content->'usage'->>'cache_read_input_tokens')::int, 0)
     + COALESCE((m.content->'usage'->>'cache_creation_input_tokens')::int, 0))::int AS effective_input_tokens
    
  FROM messages m
  INNER JOIN threads t ON t.thread_id = m.thread_id
  WHERE m.type = 'assistant_response_end'
    -- Date range filter FIRST (most selective, uses index if available)
    AND m.created_at >= (SELECT start_date FROM params)
    AND m.created_at < (SELECT end_date FROM params)
    -- Then filter JSONB (less selective but still important)
    AND m.content ? 'usage'
    AND m.content->'usage' ? 'prompt_tokens'
    AND t.account_id IS NOT NULL
),

-- Calculate costs per message
cost_calculations AS (
  SELECT
    mu.account_id,
    mu.message_id,
    mu.thread_id,
    mu.created_at,
    mu.model,
    mu.prompt_tokens,
    mu.completion_tokens,
    mu.cache_read_tokens,
    mu.cache_creation_tokens,
    mu.effective_input_tokens,
    
    -- Determine model pricing (with long-context multipliers for Sonnet-4)
    CASE
      WHEN mu.model ILIKE '%haiku%' THEN 
        (mu.prompt_tokens::numeric / 1e6 * p.haiku_input_per_m
         + mu.completion_tokens::numeric / 1e6 * p.haiku_output_per_m)
        * p.margin_mult
      
      WHEN mu.model ILIKE '%sonnet-4%' OR mu.model ILIKE '%sonnet-4-20250514%' THEN
        (
          (mu.prompt_tokens::numeric / 1e6
            * CASE WHEN mu.effective_input_tokens > 200000
                   THEN p.sonnet4_input_per_m * p.sonnet4_input_long_mult
                   ELSE p.sonnet4_input_per_m
              END)
          + (mu.completion_tokens::numeric / 1e6
            * CASE WHEN mu.effective_input_tokens > 200000
                   THEN p.sonnet4_output_per_m * p.sonnet4_output_long_mult
                   ELSE p.sonnet4_output_per_m
              END)
        ) * p.margin_mult
      
      WHEN mu.model ILIKE '%sonnet%' AND mu.model NOT ILIKE '%sonnet-4%' THEN
        (mu.prompt_tokens::numeric / 1e6 * p.sonnet_other_input_per_m
         + mu.completion_tokens::numeric / 1e6 * p.sonnet_other_output_per_m)
        * p.margin_mult
      
      WHEN mu.model ILIKE '%opus%' THEN
        (mu.prompt_tokens::numeric / 1e6 * p.opus_input_per_m
         + mu.completion_tokens::numeric / 1e6 * p.opus_output_per_m)
        * p.margin_mult
      
      ELSE 0
    END AS base_token_cost,
    
    -- Cache read cost
    -- For Sonnet-4: Use fixed pricing ($0.30/M) with long-context multiplier
    -- For other models: Use 10% discount method
    CASE
      WHEN mu.cache_read_tokens > 0 AND (mu.model ILIKE '%sonnet-4%' OR mu.model ILIKE '%sonnet-4-20250514%') THEN
        (mu.cache_read_tokens::numeric / 1e6 * p.sonnet4_cache_read_per_m_usd
         * CASE WHEN mu.effective_input_tokens > 200000 
               THEN p.sonnet4_cache_long_mult 
               ELSE 1 
          END)
        * p.margin_mult
      WHEN mu.cache_read_tokens > 0 AND mu.model ILIKE ANY(ARRAY['%anthropic%', '%claude%', '%sonnet%', '%haiku%', '%opus%']) THEN
        (mu.cache_read_tokens::numeric / 1e6 
         * CASE
             WHEN mu.model ILIKE '%haiku%' THEN p.haiku_input_per_m
             WHEN mu.model ILIKE '%sonnet%' THEN p.sonnet_other_input_per_m
             WHEN mu.model ILIKE '%opus%' THEN p.opus_input_per_m
             ELSE 0
           END
         * p.anthropic_cache_read_discount)
        * p.margin_mult
      ELSE 0
    END AS cache_read_cost,
    
    -- Cache creation cost
    -- For Sonnet-4: Use fixed pricing ($3.75/M) with long-context multiplier
    -- For other models: Use full input cost
    CASE
      WHEN mu.cache_creation_tokens > 0 AND (mu.model ILIKE '%sonnet-4%' OR mu.model ILIKE '%sonnet-4-20250514%') THEN
        (mu.cache_creation_tokens::numeric / 1e6 * p.sonnet4_cache_write_per_m_usd
         * CASE WHEN mu.effective_input_tokens > 200000 
               THEN p.sonnet4_cache_long_mult 
               ELSE 1 
          END)
        * p.margin_mult
      WHEN mu.cache_creation_tokens > 0 THEN
        (mu.cache_creation_tokens::numeric / 1e6
         * CASE
             WHEN mu.model ILIKE '%haiku%' THEN p.haiku_input_per_m
             WHEN mu.model ILIKE '%sonnet%' THEN p.sonnet_other_input_per_m
             WHEN mu.model ILIKE '%opus%' THEN p.opus_input_per_m
             ELSE 0
           END
         * p.cache_creation_multiplier)
        * p.margin_mult
      ELSE 0
    END AS cache_creation_cost
    
  FROM message_usage mu
  CROSS JOIN params p
),

-- Detect billing failures (messages that failed to charge)
-- OPTIMIZED: Add date filter to avoid scanning all status messages
nearest_failure AS (
  SELECT 
    mu.message_id,
    s.message_id AS status_message_id
  FROM message_usage mu
  LEFT JOIN LATERAL (
    SELECT m2.*
    FROM messages m2
    WHERE m2.thread_id = mu.thread_id
      AND m2.type = 'status'
      -- Date filter to limit scan range
      AND m2.created_at >= (SELECT start_date FROM params) - INTERVAL '1 day'
      AND m2.created_at < (SELECT end_date FROM params) + INTERVAL '1 day'
      AND (
        m2.content->>'status_type' = 'billing_failure'
        OR (m2.content ? 'message' AND (
          m2.content->>'message' ILIKE '%billing failure%'
          OR m2.content->>'message' ILIKE '%failed to deduct credits%'
          OR m2.content->>'message' ILIKE '%monthly spend limit exceeded%'
          OR m2.content->>'message' ILIKE '%insufficient credits%'
          OR m2.content->>'message' ILIKE '%insufficient enterprise credits%'
        ))
      )
      AND m2.created_at BETWEEN mu.created_at AND (mu.created_at + INTERVAL '60 seconds')
    ORDER BY m2.created_at ASC
    LIMIT 1
  ) s ON TRUE
),

-- Calculate final costs matching billing_integration.py logic
final_costs AS (
  SELECT
    cc.account_id,
    cc.message_id,
    cc.thread_id,
    cc.created_at,
    cc.model,
    cc.prompt_tokens,
    cc.completion_tokens,
    cc.cache_read_tokens,
    cc.cache_creation_tokens,
    cc.effective_input_tokens,
    (nf.status_message_id IS NOT NULL) AS is_billing_failure,
    
    -- Calculate costs matching OLD QUERY logic:
    -- Charge for ALL prompt_tokens and completion_tokens (with multipliers)
    -- Then add cache costs separately (fixed rates for Sonnet-4)
    -- This matches the old query structure exactly
    
    -- Base token cost (ALL tokens, including cached ones)
    -- This is already calculated in cost_calculations CTE as base_token_cost
    cc.base_token_cost AS regular_token_cost,
    
    cc.cache_read_cost,
    cc.cache_creation_cost,
    
    -- Total cost = base_token_cost (all tokens) + cache_read_cost + cache_creation_cost
    -- This matches old query: cost_usd + cache_extra_usd
    (cc.base_token_cost + cc.cache_read_cost + cc.cache_creation_cost) AS total_cost
    
  FROM cost_calculations cc
  CROSS JOIN params p
  LEFT JOIN nearest_failure nf ON nf.message_id = cc.message_id
)

-- Final aggregation by account
SELECT
  CASE WHEN GROUPING(account_id) = 1 THEN 'TOTAL' ELSE account_id::text END AS account_id,
  
  COUNT(*) AS total_messages,
  COUNT(DISTINCT thread_id) AS total_threads,
  
  -- Billing failure stats
  COUNT(*) FILTER (WHERE is_billing_failure) AS failure_count,
  COUNT(*) FILTER (WHERE NOT is_billing_failure) AS successful_messages,
  
  -- Token totals
  SUM(prompt_tokens) AS total_prompt_tokens,
  SUM(completion_tokens) AS total_completion_tokens,
  SUM(cache_read_tokens) AS total_cache_read_tokens,
  SUM(cache_creation_tokens) AS total_cache_creation_tokens,
  SUM(effective_input_tokens) AS total_effective_input_tokens,
  
  -- Cost breakdown (includes failed messages - they still consumed tokens)
  ROUND(SUM(regular_token_cost)::numeric, 4) AS total_regular_cost_usd,
  ROUND(SUM(cache_read_cost)::numeric, 4) AS total_cache_read_cost_usd,
  ROUND(SUM(cache_creation_cost)::numeric, 4) AS total_cache_creation_cost_usd,
  ROUND(SUM(total_cost)::numeric, 4) AS total_cost_usd,
  
  -- Cost breakdown for successful messages only
  ROUND(SUM(regular_token_cost) FILTER (WHERE NOT is_billing_failure)::numeric, 4) AS successful_regular_cost_usd,
  ROUND(SUM(cache_read_cost) FILTER (WHERE NOT is_billing_failure)::numeric, 4) AS successful_cache_read_cost_usd,
  ROUND(SUM(cache_creation_cost) FILTER (WHERE NOT is_billing_failure)::numeric, 4) AS successful_cache_creation_cost_usd,
  ROUND(SUM(total_cost) FILTER (WHERE NOT is_billing_failure)::numeric, 4) AS successful_total_cost_usd,
  
  -- Cost breakdown for failed messages only
  ROUND(SUM(regular_token_cost) FILTER (WHERE is_billing_failure)::numeric, 4) AS failed_regular_cost_usd,
  ROUND(SUM(cache_read_cost) FILTER (WHERE is_billing_failure)::numeric, 4) AS failed_cache_read_cost_usd,
  ROUND(SUM(cache_creation_cost) FILTER (WHERE is_billing_failure)::numeric, 4) AS failed_cache_creation_cost_usd,
  ROUND(SUM(total_cost) FILTER (WHERE is_billing_failure)::numeric, 4) AS failed_total_cost_usd,
  
  -- Model breakdown
  COUNT(*) FILTER (WHERE model ILIKE '%haiku%') AS haiku_messages,
  COUNT(*) FILTER (WHERE model ILIKE '%sonnet-4%' OR model ILIKE '%sonnet-4-20250514%') AS sonnet4_messages,
  COUNT(*) FILTER (WHERE model ILIKE '%sonnet%' AND model NOT ILIKE '%sonnet-4%') AS sonnet_other_messages,
  COUNT(*) FILTER (WHERE model ILIKE '%opus%') AS opus_messages,
  
  -- Long context stats (for Sonnet-4)
  SUM(CASE WHEN (model ILIKE '%sonnet-4%' OR model ILIKE '%sonnet-4-20250514%') AND effective_input_tokens > 200000 THEN 1 ELSE 0 END) AS long_context_calls,
  
  -- Cache usage stats
  COUNT(*) FILTER (WHERE cache_read_tokens > 0) AS messages_with_cache_read,
  COUNT(*) FILTER (WHERE cache_creation_tokens > 0) AS messages_with_cache_creation

FROM final_costs
GROUP BY GROUPING SETS ((account_id), ())
ORDER BY
  CASE WHEN account_id IS NULL THEN 1 ELSE 0 END,
  total_cost_usd DESC NULLS LAST;

