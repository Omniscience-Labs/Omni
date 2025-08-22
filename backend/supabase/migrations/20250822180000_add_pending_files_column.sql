-- Add pending_files column to projects table for storing uploaded files when sandbox creation fails
ALTER TABLE projects ADD COLUMN pending_files JSONB DEFAULT NULL;

-- Add comment to explain the purpose of this column
COMMENT ON COLUMN projects.pending_files IS 'Stores uploaded files as base64 when sandbox creation fails, to be uploaded later when sandbox becomes available';
