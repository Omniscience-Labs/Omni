BEGIN;

-- Fix encrypted_config column type to store base64 strings properly
-- Change from BYTEA to TEXT to avoid encoding issues

-- First, drop any existing data (since it's corrupted anyway)
DELETE FROM user_mcp_credentials;

-- Change the column type from BYTEA to TEXT
ALTER TABLE user_mcp_credentials 
ALTER COLUMN encrypted_config TYPE TEXT;

COMMIT; 