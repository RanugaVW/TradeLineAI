-- ==============================================================================
-- CRYPTO WEB PORTAL: RECURSION-FREE SUPABASE DATABASE SCHEMA
-- Features: Profiles with Country, Phone, Postal Code, Region, Age & RBAC
-- Safe to run in Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Create Profiles Table with Demographic & Contact Fields
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free', 'pro1', 'admin')),
  country_code TEXT,
  country_name TEXT,
  phone_number TEXT,
  postal_code TEXT,
  region TEXT,
  age INTEGER,
  tos_accepted BOOLEAN DEFAULT false,
  tos_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_phone_number UNIQUE (phone_number)
);

-- Ensure columns exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tos_accepted BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ;

-- Early Bird Lifetime tracking columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pro_subscribed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS early_bird_continuous BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS early_bird_eligible BOOLEAN DEFAULT false;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_phone_number') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT unique_phone_number UNIQUE (phone_number);
  END IF;
END $$;

-- 2. Create Chart Annotations Table
CREATE TABLE IF NOT EXISTS public.chart_annotations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  annotation_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_symbol_unique UNIQUE(user_id, symbol)
);

-- 3. High-Scale B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_chart_annotations_user_symbol 
  ON public.chart_annotations(user_id, symbol);

CREATE INDEX IF NOT EXISTS idx_profiles_role 
  ON public.profiles(role);

CREATE INDEX IF NOT EXISTS idx_profiles_email 
  ON public.profiles(email);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_annotations ENABLE ROW LEVEL SECURITY;

-- 5. Helper Function to Check Admin Status Without RLS Recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Idempotent RLS Policies for Profiles (Recursion-Free)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
  ON public.profiles FOR SELECT 
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" 
  ON public.profiles FOR UPDATE 
  USING (public.is_admin());

-- 7. Idempotent RLS Policies for Chart Annotations
DROP POLICY IF EXISTS "Users can view own annotations" ON public.chart_annotations;
CREATE POLICY "Users can view own annotations" 
  ON public.chart_annotations FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own annotations" ON public.chart_annotations;
CREATE POLICY "Users can insert own annotations" 
  ON public.chart_annotations FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own annotations" ON public.chart_annotations;
CREATE POLICY "Users can update own annotations" 
  ON public.chart_annotations FOR UPDATE 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own annotations" ON public.chart_annotations;
CREATE POLICY "Users can delete own annotations" 
  ON public.chart_annotations FOR DELETE 
  USING (auth.uid() = user_id);

-- 8. Idempotent Trigger Function for Signup Profile Generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, role, country_code, country_name, phone_number, postal_code, region, age
  )
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    COALESCE(NEW.raw_user_meta_data->>'country_code', ''),
    COALESCE(NEW.raw_user_meta_data->>'country_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'postal_code', ''),
    COALESCE(NEW.raw_user_meta_data->>'region', ''),
    COALESCE((NEW.raw_user_meta_data->>'age')::INTEGER, 18)
  )
  ON CONFLICT (id) DO UPDATE SET
    country_code = EXCLUDED.country_code,
    country_name = EXCLUDED.country_name,
    phone_number = EXCLUDED.phone_number,
    postal_code = EXCLUDED.postal_code,
    region = EXCLUDED.region,
    age = EXCLUDED.age;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. AI Predictions History Table
CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  signal TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  stop_loss_price NUMERIC NOT NULL,
  take_profit_levels JSONB NOT NULL,
  expected_duration_text TEXT NOT NULL,
  target_resolution_time TIMESTAMPTZ NOT NULL,
  target_colombo_time_text TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'expired')),
  evaluation_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own predictions" ON public.ai_predictions;
CREATE POLICY "Users can view own predictions" 
  ON public.ai_predictions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own predictions" ON public.ai_predictions;
CREATE POLICY "Users can insert own predictions" 
  ON public.ai_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own predictions" ON public.ai_predictions;
CREATE POLICY "Users can update own predictions" 
  ON public.ai_predictions FOR UPDATE USING (auth.uid() = user_id);
