-- InsurAI Database Schema for Supabase
-- Run this in the Supabase SQL Editor to set up your database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Note: We use TEXT with CHECK constraints instead of ENUM for flexibility
-- This matches the migrations and allows Turkish insurance types

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  locale TEXT DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies table
CREATE TABLE public.policies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  policy_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business')),
  type_tr TEXT NOT NULL,
  coverage NUMERIC NOT NULL,
  premium NUMERIC NOT NULL,
  deductible NUMERIC DEFAULT 0,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'pending')),
  insured_person TEXT NOT NULL,
  location TEXT,
  document_type TEXT DEFAULT 'policy',
  upload_date DATE DEFAULT CURRENT_DATE,
  logo TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policy documents table (for file uploads)
CREATE TABLE public.policy_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  policy_id UUID REFERENCES public.policies(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_policies_user_id ON public.policies(user_id);
CREATE INDEX idx_policies_status ON public.policies(status);
CREATE INDEX idx_policies_expiry_date ON public.policies(expiry_date);
CREATE INDEX idx_policy_documents_policy_id ON public.policy_documents(policy_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for policies table
CREATE POLICY "Users can view their own policies"
  ON public.policies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own policies"
  ON public.policies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own policies"
  ON public.policies FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own policies"
  ON public.policies FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for policy_documents table
CREATE POLICY "Users can view their own documents"
  ON public.policy_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.policies
      WHERE policies.id = policy_documents.policy_id
      AND policies.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own documents"
  ON public.policy_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.policies
      WHERE policies.id = policy_documents.policy_id
      AND policies.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own documents"
  ON public.policy_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.policies
      WHERE policies.id = policy_documents.policy_id
      AND policies.user_id = auth.uid()
    )
  );

-- Function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to auto-update policy status based on expiry date
CREATE OR REPLACE FUNCTION public.update_policy_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expiry_date < CURRENT_DATE THEN
    NEW.status = 'expired';
  ELSIF NEW.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN
    NEW.status = 'expiring';
  ELSE
    NEW.status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_policy_status_trigger
  BEFORE INSERT OR UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.update_policy_status();

-- Storage bucket for policy documents
-- Note: Run this in the Supabase Dashboard > Storage > Create bucket
-- Bucket name: documents
-- Public: false (private bucket)
