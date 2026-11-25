-- Classroom announcements
-- Run this once in the Supabase SQL editor before adding the instructor
-- announcement composer. Student class pages gracefully show an empty state
-- until this migration has been applied.

create table if not exists school.classroom_announcements (
  id bigint generated always as identity primary key,
  classroom_id uuid not null references school.classrooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(trim(title)) between 1 and 140),
  body text not null check (char_length(trim(body)) between 1 and 3000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists classroom_announcements_classroom_created_idx
  on school.classroom_announcements (classroom_id, created_at desc);

alter table school.classroom_announcements enable row level security;

grant select, insert, update, delete on school.classroom_announcements to service_role;
grant usage, select on sequence school.classroom_announcements_id_seq to service_role;
