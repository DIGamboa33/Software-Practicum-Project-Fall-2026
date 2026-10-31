alter table learning.student_case_assignments
  add column if not exists classroom_id uuid references school.classrooms(id);

create table if not exists learning.note_reviews (
  id bigint generated always as identity primary key,
  note_id bigint not null references learning.notes(id),
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('Approved', 'Returned')),
  comments text,
  created_at timestamptz not null default now()
);
create index if not exists note_reviews_note_idx on learning.note_reviews (note_id, created_at desc);
alter table learning.note_reviews enable row level security;
grant select, insert on learning.note_reviews to service_role;