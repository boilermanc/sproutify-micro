-- Run this query in Supabase SQL Editor to check the farms table schema
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'farms'
ORDER BY ordinal_position;

