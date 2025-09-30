-- Seed data for testing

-- Insert branches (using Moscow and nearby cities)
INSERT INTO public.branches (name, address, coords) VALUES
  ('Moscow Central Office', 'Tverskaya Street 1, Moscow', ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326)),
  ('St. Petersburg Branch', 'Nevsky Prospect 28, St. Petersburg', ST_SetSRID(ST_MakePoint(30.3609, 59.9311), 4326)),
  ('Kazan Office', 'Bauman Street 15, Kazan', ST_SetSRID(ST_MakePoint(49.1221, 55.7887), 4326)),
  ('Yekaterinburg Branch', 'Lenina Avenue 40, Yekaterinburg', ST_SetSRID(ST_MakePoint(60.6057, 56.8389), 4326)),
  ('Nizhny Novgorod Office', 'Bolshaya Pokrovskaya Street 10, Nizhny Novgorod', ST_SetSRID(ST_MakePoint(44.0024, 56.2965), 4326));

-- Insert regular employees
INSERT INTO public.employees (full_name, tab_number, role_title, is_substitute, rating) VALUES
  ('Ivan Petrov', 'EMP001', 'Accountant', false, 4.2),
  ('Maria Sokolova', 'EMP002', 'HR Specialist', false, 4.5),
  ('Dmitry Ivanov', 'EMP003', 'IT Administrator', false, 3.8);

-- Insert substitute employees
INSERT INTO public.employees (full_name, tab_number, role_title, is_substitute, rating, contacts_json) VALUES
  ('Elena Volkova', 'SUB001', 'Accountant', true, 4.7, '{"phone": "+7-900-111-2233", "email": "volkova@company.ru"}'::jsonb),
  ('Sergey Morozov', 'SUB002', 'HR Specialist', true, 4.3, '{"phone": "+7-900-222-3344", "email": "morozov@company.ru"}'::jsonb),
  ('Olga Kuznetsova', 'SUB003', 'IT Administrator', true, 4.9, '{"phone": "+7-900-333-4455", "email": "kuznetsova@company.ru"}'::jsonb),
  ('Alexey Smirnov', 'SUB004', 'Accountant', true, 4.1, '{"phone": "+7-900-444-5566", "email": "smirnov@company.ru"}'::jsonb),
  ('Natalia Lebedeva', 'SUB005', 'HR Specialist', true, 4.8, '{"phone": "+7-900-555-6677", "email": "lebedeva@company.ru"}'::jsonb);

-- Insert substitute profiles
INSERT INTO public.substitute_profiles (employee_id, base_region, base_coords, current_coords, constraints_json, preferred_regions_json, active)
SELECT id, 'Moscow', ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326), ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326), 
  '{"max_trips_per_month": 4, "weekends_allowed": true, "banned_regions": []}'::jsonb,
  '["Moscow", "St. Petersburg"]'::jsonb, true
FROM public.employees WHERE tab_number = 'SUB001';

INSERT INTO public.substitute_profiles (employee_id, base_region, base_coords, current_coords, constraints_json, preferred_regions_json, active)
SELECT id, 'St. Petersburg', ST_SetSRID(ST_MakePoint(30.3609, 59.9311), 4326), ST_SetSRID(ST_MakePoint(30.3609, 59.9311), 4326),
  '{"max_trips_per_month": 3, "weekends_allowed": false, "banned_regions": []}'::jsonb,
  '["St. Petersburg", "Moscow"]'::jsonb, true
FROM public.employees WHERE tab_number = 'SUB002';

INSERT INTO public.substitute_profiles (employee_id, base_region, base_coords, current_coords, constraints_json, preferred_regions_json, active)
SELECT id, 'Kazan', ST_SetSRID(ST_MakePoint(49.1221, 55.7887), 4326), ST_SetSRID(ST_MakePoint(49.1221, 55.7887), 4326),
  '{"max_trips_per_month": 5, "weekends_allowed": true, "banned_regions": []}'::jsonb,
  '["Kazan", "Nizhny Novgorod"]'::jsonb, true
FROM public.employees WHERE tab_number = 'SUB003';

INSERT INTO public.substitute_profiles (employee_id, base_region, base_coords, current_coords, constraints_json, preferred_regions_json, active)
SELECT id, 'Yekaterinburg', ST_SetSRID(ST_MakePoint(60.6057, 56.8389), 4326), ST_SetSRID(ST_MakePoint(60.6057, 56.8389), 4326),
  '{"max_trips_per_month": 4, "weekends_allowed": true, "banned_regions": []}'::jsonb,
  '["Yekaterinburg"]'::jsonb, true
FROM public.employees WHERE tab_number = 'SUB004';

INSERT INTO public.substitute_profiles (employee_id, base_region, base_coords, current_coords, constraints_json, preferred_regions_json, active)
SELECT id, 'Moscow', ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326), ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326),
  '{"max_trips_per_month": 6, "weekends_allowed": true, "banned_regions": []}'::jsonb,
  '["Moscow", "Nizhny Novgorod"]'::jsonb, true
FROM public.employees WHERE tab_number = 'SUB005';

-- Insert absences that trigger requests
INSERT INTO public.absences (employee_id, branch_id, type, start_at, end_at, criticality)
SELECT 
  (SELECT id FROM public.employees WHERE tab_number = 'EMP001'),
  (SELECT id FROM public.branches WHERE name = 'Moscow Central Office'),
  'leave',
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '12 days',
  8;

INSERT INTO public.absences (employee_id, branch_id, type, start_at, end_at, criticality)
SELECT 
  (SELECT id FROM public.employees WHERE tab_number = 'EMP002'),
  (SELECT id FROM public.branches WHERE name = 'St. Petersburg Branch'),
  'sick',
  NOW() + INTERVAL '2 days',
  NOW() + INTERVAL '7 days',
  7;

INSERT INTO public.absences (employee_id, branch_id, type, start_at, end_at, criticality)
SELECT 
  (SELECT id FROM public.employees WHERE tab_number = 'EMP003'),
  (SELECT id FROM public.branches WHERE name = 'Kazan Office'),
  'leave',
  NOW() + INTERVAL '10 days',
  NOW() + INTERVAL '17 days',
  6;

-- Insert assignment requests based on absences
INSERT INTO public.assignment_requests (branch_id, role_title, period_start, period_end, must_start_by, priority, status)
SELECT 
  (SELECT id FROM public.branches WHERE name = 'Moscow Central Office'),
  'Accountant',
  NOW() + INTERVAL '5 days',
  NOW() + INTERVAL '12 days',
  NOW() + INTERVAL '4 days',
  8,
  'open';

INSERT INTO public.assignment_requests (branch_id, role_title, period_start, period_end, must_start_by, priority, status)
SELECT 
  (SELECT id FROM public.branches WHERE name = 'St. Petersburg Branch'),
  'HR Specialist',
  NOW() + INTERVAL '2 days',
  NOW() + INTERVAL '7 days',
  NOW() + INTERVAL '1 day',
  7,
  'open';

INSERT INTO public.assignment_requests (branch_id, role_title, period_start, period_end, must_start_by, priority, status)
SELECT 
  (SELECT id FROM public.branches WHERE name = 'Kazan Office'),
  'IT Administrator',
  NOW() + INTERVAL '10 days',
  NOW() + INTERVAL '17 days',
  NOW() + INTERVAL '8 days',
  6,
  'open';