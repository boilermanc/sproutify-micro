-- Create pre_registrations table for pre-launch signups
CREATE TABLE IF NOT EXISTS public.pre_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  email text NOT NULL,
  inserted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pre_registrations_pkey PRIMARY KEY (id),
  CONSTRAINT pre_registrations_email_key UNIQUE (email)
) TABLESPACE pg_default;

-- Add RLS policies (allow anyone to insert, but restrict reads to authenticated users)
ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (for public signup form)
CREATE POLICY "Allow public insert" ON public.pre_registrations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only allow authenticated users to read
CREATE POLICY "Allow authenticated read" ON public.pre_registrations
  FOR SELECT
  TO authenticated
  USING (true);








