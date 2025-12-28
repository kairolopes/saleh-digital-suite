-- Create storage bucket for recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true);

-- Allow anyone to view recipe images (public bucket)
CREATE POLICY "Anyone can view recipe images"
ON storage.objects FOR SELECT
USING (bucket_id = 'recipe-images');

-- Allow authenticated staff to upload recipe images
CREATE POLICY "Staff can upload recipe images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'recipe-images' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated staff to update recipe images
CREATE POLICY "Staff can update recipe images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'recipe-images' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated staff to delete recipe images
CREATE POLICY "Staff can delete recipe images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'recipe-images' 
  AND auth.role() = 'authenticated'
);