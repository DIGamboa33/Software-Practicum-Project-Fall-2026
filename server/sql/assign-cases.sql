-- Assign-case feature: database changes (already applied in Supabase)

-- Case metadata and note type
alter table learning.cases
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists date_of_birth date;

alter table learning.student_case_assignments
  add column if not exists note_type text not null default 'soap',
  add column if not exists due_at timestamptz;

-- Instructor-only answer key
create table if not exists learning.case_expectations (
  case_id bigint primary key references learning.cases(id) on delete cascade,
  expected_diagnoses text[] not null default '{}',
  instructor_notes text,
  created_at timestamptz not null default now()
);

-- Rubric criteria with points, and points awarded per review
create table if not exists learning.rubric_criteria (
  id bigint generated always as identity primary key,
  case_id bigint not null references learning.cases(id) on delete cascade,
  position int not null default 0,
  description text not null,
  max_points numeric not null check (max_points >= 0)
);

create table if not exists learning.review_scores (
  review_id bigint not null references learning.note_reviews(id) on delete cascade,
  criterion_id bigint not null references learning.rubric_criteria(id) on delete cascade,
  points_awarded numeric not null check (points_awarded >= 0),
  primary key (review_id, criterion_id)
);

-- Row level security (server only) and grants
alter table learning.case_expectations enable row level security;
alter table learning.rubric_criteria enable row level security;
alter table learning.review_scores enable row level security;

grant select, insert, update, delete on learning.case_expectations to service_role;
grant select, insert, update, delete on learning.rubric_criteria to service_role;
grant select, insert, update, delete on learning.review_scores to service_role;
grant insert, update, delete on learning.cases to service_role;

create table learning.assignment_drafts (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  classroom_id uuid references school.classrooms(id) on delete set null,
  title text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table learning.assignment_drafts enable row level security;
grant select, insert, update, delete on learning.assignment_drafts to service_role;