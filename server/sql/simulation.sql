create table if not exists learning.simulation_encounters (
  id uuid primary key default gen_random_uuid(),
  case_id bigint not null references learning.cases(id) on delete cascade,
  classroom_id uuid not null references school.classrooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active','completed')),
  shared_data jsonb not null default '{}'::jsonb,
  referral_subrole_id smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learning.simulation_steps (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references learning.simulation_encounters(id) on delete cascade,
  step_key text not null,
  step_order smallint not null,
  subrole_id smallint,
  student_id uuid not null references public.profiles(id),
  assignment_id bigint unique
    references learning.student_case_assignments(id) on delete set null,
  status text not null default 'locked' check (status in ('locked','open','done','skipped')),
  completed_at timestamptz,
  unique (encounter_id, step_order)
);

create index if not exists simulation_steps_encounter_idx
  on learning.simulation_steps (encounter_id);

grant select, insert, update, delete on learning.simulation_encounters to service_role;
grant select, insert, update, delete on learning.simulation_steps to service_role;