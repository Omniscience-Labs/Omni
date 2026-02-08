-- Bucket for load_image (vision tool): stores converted/loaded images for LLM context.
-- Must be public so get_public_url() works and the model can fetch the image.
BEGIN;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
    'image-uploads',
    'image-uploads',
    true,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']::text[],
    5242880
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload to image-uploads" ON storage.objects;
DROP POLICY IF EXISTS "image-uploads are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete from image-uploads" ON storage.objects;

CREATE POLICY "Authenticated can upload to image-uploads" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'image-uploads'
    AND auth.role() = 'authenticated'
);

CREATE POLICY "image-uploads are publicly readable" ON storage.objects
FOR SELECT USING (bucket_id = 'image-uploads');

CREATE POLICY "Authenticated can delete from image-uploads" ON storage.objects
FOR DELETE USING (
    bucket_id = 'image-uploads'
    AND auth.role() = 'authenticated'
);

COMMIT;
