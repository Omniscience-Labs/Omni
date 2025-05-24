DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='threads' AND column_name='agent_id') THEN
        ALTER TABLE threads ADD COLUMN agent_id UUID REFERENCES agents(agent_id) ON DELETE SET NULL;
        CREATE INDEX idx_threads_agent_id ON threads(agent_id);
        COMMENT ON COLUMN threads.agent_id IS 'ID of the agent used for this conversation thread. If NULL, uses account default agent.';
    END IF;
END $$;

UPDATE threads 
SET agent_id = (
    SELECT a.agent_id 
    FROM agents a 
    WHERE a.account_id = threads.account_id 
    AND a.is_default = true 
    LIMIT 1
)
WHERE agent_id IS NULL;
