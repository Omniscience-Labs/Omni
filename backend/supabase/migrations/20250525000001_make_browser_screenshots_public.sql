-- Make the browser-screenshots bucket public so images can be accessed without authentication
UPDATE storage.buckets 
SET public = true 
WHERE id = 'browser-screenshots'; 