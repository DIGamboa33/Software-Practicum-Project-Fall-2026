-- CareFlow: Classroom Allowed Disciplines
-- Software Practicum, Fall 2026
-- Creates a junction table allowing classrooms to accept
-- students from multiple disciplines.

BEGIN;

-- STEP 1: Create the junction table.
-- Copy the column types from the existing classrooms table.
-- WITH NO DATA means we are not copying classroom records yet.

CREATE TABLE IF NOT EXISTS school.classroom_allowed_subroles AS
SELECT
    id AS classroom_id,
    discipline_subrole_id AS subrole_id
FROM school.classrooms
WITH NO DATA;

-- Record when the discipline was added to the classroom.

ALTER TABLE school.classroom_allowed_subroles
ADD COLUMN IF NOT EXISTS created_at
TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Both columns must contain a value.

ALTER TABLE school.classroom_allowed_subroles
ALTER COLUMN classroom_id SET NOT NULL,
ALTER COLUMN subrole_id SET NOT NULL;


-- STEP 2: Create the primary and foreign keys.
-- Prevent duplicate classroom-discipline combinations.

DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid =
          'school.classroom_allowed_subroles'::regclass
        AND conname = 'classroom_allowed_subroles_pkey'
    ) THEN

        ALTER TABLE school.classroom_allowed_subroles
        ADD CONSTRAINT classroom_allowed_subroles_pkey
        PRIMARY KEY (classroom_id, subrole_id);

    END IF;

    -- Connect classroom_id to the classrooms table.

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid =
          'school.classroom_allowed_subroles'::regclass
        AND conname = 'classroom_allowed_subroles_classroom_fkey'
    ) THEN

        ALTER TABLE school.classroom_allowed_subroles
        ADD CONSTRAINT classroom_allowed_subroles_classroom_fkey
        FOREIGN KEY (classroom_id)
        REFERENCES school.classrooms(id)
        ON DELETE CASCADE;

    END IF;

    -- Connect subrole_id to the disciplines table.

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid =
          'school.classroom_allowed_subroles'::regclass
        AND conname = 'classroom_allowed_subroles_subrole_fkey'
    ) THEN

        ALTER TABLE school.classroom_allowed_subroles
        ADD CONSTRAINT classroom_allowed_subroles_subrole_fkey
        FOREIGN KEY (subrole_id)
        REFERENCES public.subroles(id)
        ON DELETE RESTRICT;

    END IF;

END;
$$;


-- STEP 3: Create an index for discipline lookups.

CREATE INDEX IF NOT EXISTS
classroom_allowed_subroles_subrole_idx
ON school.classroom_allowed_subroles
(subrole_id, classroom_id);


-- STEP 4: Migrate existing classroom disciplines.
-- Every classroom's current primary discipline
-- becomes an accepted discipline.
-- ON CONFLICT prevents duplicate records.

INSERT INTO school.classroom_allowed_subroles
    (classroom_id, subrole_id)
SELECT
    id,
    discipline_subrole_id
FROM school.classrooms
WHERE discipline_subrole_id IS NOT NULL
ON CONFLICT (classroom_id, subrole_id) DO NOTHING;


-- STEP 5: Protect the junction table.
-- Only the backend service role can manage memberships.

ALTER TABLE school.classroom_allowed_subroles
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE school.classroom_allowed_subroles
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, DELETE
ON TABLE school.classroom_allowed_subroles
TO service_role;

COMMIT;
