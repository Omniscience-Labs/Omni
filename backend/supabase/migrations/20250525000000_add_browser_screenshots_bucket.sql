-- Create the browser-screenshots bucket for browser automation screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('browser-screenshots', 'browser-screenshots', false, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
ON CONFLICT (id) DO NOTHING; -- Avoid error if bucket already exists

-- RLS policies for the 'browser-screenshots' bucket
-- Allow authenticated users to view screenshot files
CREATE POLICY "Authenticated users can select browser screenshot files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'browser-screenshots');

-- Allow authenticated users to upload screenshot files
CREATE POLICY "Authenticated users can insert browser screenshot files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'browser-screenshots');

-- Allow authenticated users to update screenshot files
CREATE POLICY "Authenticated users can update browser screenshot files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'browser-screenshots');

-- Allow authenticated users to delete screenshot files (optional, for cleanup)
CREATE POLICY "Authenticated users can delete browser screenshot files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'browser-screenshots'); 