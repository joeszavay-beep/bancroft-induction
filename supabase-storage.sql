-- ============================================
-- Storage Bucket Setup
-- Run this AFTER the schema SQL above
-- ============================================

-- Create the documents storage bucket (public so files are accessible)
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true);

-- Allow public uploads and reads
CREATE POLICY "Allow public uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Allow public reads" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Allow public deletes" ON storage.objects FOR DELETE USING (bucket_id = 'documents');
