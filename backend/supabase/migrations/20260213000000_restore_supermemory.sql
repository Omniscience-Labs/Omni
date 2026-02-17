-- Restore Memories Table and Search Function

-- Enable vector extension if not exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memories table
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    role TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    enterprise_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (safe)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Create indexes (safe)
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);

CREATE INDEX IF NOT EXISTS idx_memories_embedding 
ON memories 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 🔥 SAFE POLICY CREATION

DROP POLICY IF EXISTS "Users can manage their own memories" ON memories;
CREATE POLICY "Users can manage their own memories"
    ON memories
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role has full access to memories" ON memories;
CREATE POLICY "Service role has full access to memories"
    ON memories
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- RPC Function for similarity search (already safe)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding VECTOR(1536),
    match_threshold FLOAT,
    match_count INT,
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    role TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.role,
        1 - (m.embedding <=> query_embedding) AS similarity
    FROM memories m
    WHERE 1 - (m.embedding <=> query_embedding) > match_threshold
    AND m.user_id = p_user_id
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;