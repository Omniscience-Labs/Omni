-- Create storage bucket for customer request images
BEGIN;

-- Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'customer-request-images',
    'customer-request-images',
    true,  -- Make public so Linear can access the images
    5242880,  -- 5MB limit per image
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policy for public read access
CREATE POLICY IF NOT EXISTS "Public read access for customer request images"
ON storage.objects FOR SELECT
USING (bucket_id = 'customer-request-images');

-- Create RLS policy for authenticated users to upload
CREATE POLICY IF NOT EXISTS "Authenticated users can upload customer request images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'customer-request-images' 
    AND auth.role() = 'authenticated'
);

COMMIT;

