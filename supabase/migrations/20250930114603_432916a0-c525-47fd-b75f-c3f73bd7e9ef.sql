-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create enums
CREATE TYPE public.absence_type AS ENUM ('leave', 'sick');
CREATE TYPE public.assignment_status AS ENUM ('draft', 'pending_approval', 'approved', 'declined', 'executing', 'done', 'canceled');
CREATE TYPE public.request_status AS ENUM ('open', 'matching', 'assigned', 'closed', 'canceled');
CREATE TYPE public.travel_mode AS ENUM ('air', 'rail', 'car');
CREATE TYPE public.user_role AS ENUM ('admin', 'hr', 'dispatcher');

-- Employees table
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  tab_number TEXT UNIQUE NOT NULL,
  role_title TEXT NOT NULL,
  is_substitute BOOLEAN DEFAULT false,
  rating NUMERIC(3,2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  contacts_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Substitute profiles table
CREATE TABLE public.substitute_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_region TEXT NOT NULL,
  base_coords GEOGRAPHY(POINT) NOT NULL,
  current_coords GEOGRAPHY(POINT),
  availability_calendar_json JSONB DEFAULT '[]'::jsonb,
  constraints_json JSONB DEFAULT '{}'::jsonb,
  preferred_regions_json JSONB DEFAULT '[]'::jsonb,
  active BOOLEAN DEFAULT true,
  UNIQUE(employee_id)
);

-- Branches table
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  coords GEOGRAPHY(POINT) NOT NULL,
  work_hours_json JSONB DEFAULT '{}'::jsonb,
  contact_name TEXT,
  contact_phone TEXT
);

-- Absences table
CREATE TABLE public.absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  type public.absence_type NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  criticality SMALLINT DEFAULT 5 CHECK (criticality >= 1 AND criticality <= 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assignment requests table
CREATE TABLE public.assignment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  must_start_by TIMESTAMPTZ NOT NULL,
  priority SMALLINT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  status public.request_status DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assignment candidates table
CREATE TABLE public.assignment_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.assignment_requests(id) ON DELETE CASCADE,
  substitute_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  eta_at TIMESTAMPTZ,
  logistics_json JSONB DEFAULT '{}'::jsonb,
  scenario_type TEXT DEFAULT 'default'
);

-- Assignments table
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.assignment_requests(id) ON DELETE CASCADE,
  substitute_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status public.assignment_status DEFAULT 'draft',
  approver_user_id UUID REFERENCES auth.users(id),
  planned_start_at TIMESTAMPTZ NOT NULL,
  planned_end_at TIMESTAMPTZ NOT NULL,
  travel_cost_est NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Travel options table
CREATE TABLE public.travel_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_coords GEOGRAPHY(POINT) NOT NULL,
  to_coords GEOGRAPHY(POINT) NOT NULL,
  mode public.travel_mode NOT NULL,
  eta_hours NUMERIC(6,2) NOT NULL,
  cost_est NUMERIC(10,2) NOT NULL,
  hops_json JSONB DEFAULT '[]'::jsonb,
  request_id UUID REFERENCES public.assignment_requests(id) ON DELETE CASCADE,
  substitute_id UUID REFERENCES public.employees(id) ON DELETE CASCADE
);

-- Users table (for additional profile data)
CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.user_role DEFAULT 'dispatcher',
  time_zone TEXT DEFAULT 'Europe/Moscow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log table
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  data_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value_json JSONB NOT NULL
);

-- Create indices
CREATE INDEX idx_employees_substitute ON public.employees(is_substitute);
CREATE INDEX idx_absences_dates ON public.absences(start_at, end_at);
CREATE INDEX idx_requests_status ON public.assignment_requests(status);
CREATE INDEX idx_requests_dates ON public.assignment_requests(period_start, period_end);
CREATE INDEX idx_assignments_status ON public.assignments(status);
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);

-- Create spatial indices
CREATE INDEX idx_substitute_base_coords ON public.substitute_profiles USING GIST(base_coords);
CREATE INDEX idx_branch_coords ON public.branches USING GIST(coords);

-- Enable Row Level Security
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitute_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employees
CREATE POLICY "Employees viewable by authenticated users" ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Employees editable by HR and admin" ON public.employees FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- RLS Policies for substitute_profiles
CREATE POLICY "Substitute profiles viewable by authenticated users" ON public.substitute_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Substitute profiles editable by HR and admin" ON public.substitute_profiles FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- RLS Policies for branches
CREATE POLICY "Branches viewable by authenticated users" ON public.branches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Branches editable by admin" ON public.branches FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for absences
CREATE POLICY "Absences viewable by authenticated users" ON public.absences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Absences creatable by HR and admin" ON public.absences FOR INSERT TO authenticated 
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'hr')));

-- RLS Policies for assignment_requests
CREATE POLICY "Requests viewable by authenticated users" ON public.assignment_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Requests manageable by HR, dispatcher and admin" ON public.assignment_requests FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'dispatcher')));

-- RLS Policies for assignment_candidates
CREATE POLICY "Candidates viewable by authenticated users" ON public.assignment_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Candidates manageable by system" ON public.assignment_candidates FOR ALL TO authenticated USING (true);

-- RLS Policies for assignments
CREATE POLICY "Assignments viewable by authenticated users" ON public.assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Assignments manageable by HR, dispatcher and admin" ON public.assignments FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin', 'hr', 'dispatcher')));

-- RLS Policies for travel_options
CREATE POLICY "Travel options viewable by authenticated users" ON public.travel_options FOR SELECT TO authenticated USING (true);

-- RLS Policies for user_profiles
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.user_profiles FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can manage profiles" ON public.user_profiles FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for audit_log
CREATE POLICY "Audit log viewable by admin" ON public.audit_log FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Audit log writable by all authenticated" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for settings
CREATE POLICY "Settings viewable by authenticated users" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Settings editable by admin" ON public.settings FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin'));

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments 
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role)
  VALUES (new.id, new.email, 'dispatcher');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert default scoring weights
INSERT INTO public.settings (key, value_json) VALUES 
  ('scoring_weights', '{"speed": 0.4, "logistics": 0.35, "load": 0.25}'::jsonb),
  ('scoring_weights_fast', '{"speed": 0.5, "logistics": 0.35, "load": 0.15}'::jsonb),
  ('scoring_weights_near', '{"speed": 0.25, "logistics": 0.6, "load": 0.15}'::jsonb),
  ('logistics_rules', '{"air_threshold_km": 1500, "rail_threshold_km": 200, "air_speed_kmh": 700, "rail_speed_kmh": 80, "car_speed_kmh": 60, "air_base_cost": 5000, "rail_base_cost": 1500, "car_base_cost": 500, "air_cost_per_km": 3, "rail_cost_per_km": 1, "car_cost_per_km": 0.5}'::jsonb),
  ('max_trips_per_month', '{"default": 4}'::jsonb);