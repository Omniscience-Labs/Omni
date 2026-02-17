-- Create the storage bucket for customer request images
INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-request-images', 'customer-request-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload customer request images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'customer-request-images' );

-- Policy to allow public to view images (since they are public URLs)
CREATE POLICY "Public can view customer request images"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'customer-request-images' );
