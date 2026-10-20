# CareFlow | Software Practicum, Fall 2026

**Team 4 · Educational Electronic Health Record (EHR) Prototype**

CareFlow is a web application being developed for a university pharmacy education practicum. It provides a simulated clinical learning environment where students can work through patient cases, record encounters, write SOAP notes, enter mock orders, and receive instructor feedback. Instructors can organize classes and review submitted work, while administrators can manage accounts, classrooms, and system activity. A separate patient portal demonstrates the patient's perspective.

The long-term goal is to build a foundation that could support pharmacy education and, with additional development, other health professions such as physical therapy, psychiatry, etc. We are building a foundation for the UTEP staff to look and build upon to meet the institution's goal of maximizing the learning experience.

CareFlow is not a production EHR, medical device, or validated clinical decision-support system. All demonstrations should use fictional or appropriately authorized synthetic data. Do not upload real patient health information.

 Project status

 This README describes functionality present on the GitHub `main` branch through the October 19 team merges. Features listed here are implemented in the repository, but not all have been independently tested against every database configuration.

| User role / area | Implemented in the current prototype | Still limited or in progress |
| --- | --- | --- |
| Authentication | Supabase Auth sign-in; role/subrole-based application navigation; Student/Patient registration endpoints; session restoration | Production security review, complete account lifecycle and permission testing |
| Administrator | Operations overview; searchable user and patient directories; account invitations, access updates, password-reset requests, activate/deactivate; audit-log support; bulk student-account creation; classroom creation and instructor assignment | Full superuser permissions, scenario assignment tools, deeper audit/analytics |
| Admin activity | Classroom and instructor overview, enrollment counts, groups, student rosters, individual student details, case/encounter progress, SOAP status, order counts, search and activity filters | Activity is a current-state snapshot, not a chronological audit log; case-to-classroom reporting requires consistent assignment links |
| Instructor | Dashboard; view assigned classrooms/rosters; create groups and manage group members; submitted-note review with Approved/Returned decisions and comments | Scenario library, grading rubrics, comprehensive feedback/grades, class archiving |
| Student | My Classes; assigned patient cases; encounter status; structured SOAP drafting and persistence; mock orders; submission for instructor review; returned feedback | Full interprofessional workflow, grading and realistic medication-interaction validation |
| Patient | Database-connected overview, care-team view, appointments, health insights, medications, history, referrals, and vitals; appointment scheduling API | Clinical integration, complete data validation, hardening of access control and patient workflows |
| Deployment and testing | Local React + Express development; frontend build and Oxlint commands | Public hosting, automated test suite, complete database migrations, production readiness |

 Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React 19, React Router, Vite 8 | Role-specific pages, navigation, and forms |
| Backend | Node.js, Express 5 | REST API routes, validation, and authorization checks |
| Authentication | Supabase Auth | Login sessions and managed user accounts |
| Database | Supabase PostgreSQL | Persistent educational records and account profiles |
| Database access | `@supabase/supabase-js` | Server-side queries to PostgreSQL |
| Developer tools | npm, Oxlint, Git/GitHub | Local development, linting, and collaboration |

The React frontend communicates with the Express API through `/api/...` URLs. During local development, Vite proxies these requests to the Express server on port `3001`. The Express server connects to Supabase.

```text
React + Vite (localhost:5173)
             |
             | /api/*
             v
Node.js + Express (localhost:3001)
             |
             v
Supabase Auth + PostgreSQL
  |-- public: profiles, roles, subroles, admin audit log
  |-- school: classrooms, instructors, enrollments, groups
  |-- learning: cases, student assignments, SOAP notes, reviews, orders
  `-- patient_portal: simulated patient information
```

## Main features

 1. Administrator workspace

**Operations:** Displays overall account statistics, including role distribution and recent account creation.

**Global user search:** Searches accounts by name, email, role, subrole, CareFlow ID, or UTEP ID. Authorized Admin operations include inviting users, changing permitted role/subrole assignments, requesting password resets, and activating or deactivating non-Admin accounts. Some privileged actions are recorded in `public.admin_audit_log`. Existing Admin-role creation and modification remain restricted rather than being unrestricted superuser operations.

**Semesters & classes:** Administrators can view classrooms, create a classroom with a term and discipline, associate instructors, and create student accounts in bulk. Bulk creation generates temporary credentials for new student accounts. These must be handled securely and should never be committed to Git.

**Classroom & Student Activity:** Administrators can view classroom details, instructors, enrollment counts, group counts, and student rosters; open an individual student's activity panel; and review case status, SOAP note status, order counts, and last-updated information. Filters identify unstarted/draft/returned documentation and unfinished encounters. These filters describe **current workflow state**, not lateness or clinical performance.

**Patients:** A patient directory and detail page are available for Admin review of configured patient records.

 2. Instructor workspace

Instructors can view classrooms and rosters assigned to their discipline, create groups, and add eligible enrolled students to groups. Administrators currently provision classrooms through the UI. Classroom access is checked by instructor membership and matching discipline.

The **Review & Co-sign** page loads student submissions associated with the instructor's classrooms. Instructors can inspect the submitted SOAP note and orders, then:

- **Approve** the submission; or
- **Return** it for changes, with written feedback required for a return.

The application records review decisions and comments in the learning database. Full rubric-based grading, detailed scenario creation, and course closeout remain future work.

 3. Student workspace

Students can view their enrolled classes, class details, and assigned simulated patient cases. For a case, students can update encounter progress, create and save structured SOAP documentation, and add mock orders.

SOAP documentation covers the Subjective, Objective, Assessment, and Plan sections, including relevant clinical-history and examination fields. Saved notes and orders are stored in Supabase rather than only in React state.

Students can preview their SOAP note and orders before submitting for instructor review. A submitted note moves to **Pending Review**. Editing of submitted documentation/orders is restricted until the instructor returns it. Students can view instructor comments and revise returned work. Approved submissions remain marked accordingly.

Current workflow statuses include **Draft**, **Pending Review**, **Approved**, and **Returned**. Encounter stages are tracked separately from note-review status.

 4. Patient portal

The patient-facing pages cover an overview of simulated medical information, the care team, appointments, and health insights. Current server routes query patient-related Supabase tables for items such as medical history, medications, allergies, clinical updates, referrals, and vitals.

Appointment and referral-related API actions exist in the prototype. They are educational demonstrations, not connections to a real scheduling system, pharmacy, hospital, or EHR provider.

## Run the project locally

### Requirements

- Git
- Node.js and npm compatible with the repository's Vite version (a current supported Node.js LTS release is recommended)
- Access to the team's configured Supabase project
- Required Supabase tables, roles, and sample data already present in the project

 1. Clone and install

```bash
git clone https://github.com/quinn-anaiah/Software-Practicum-Project-Fall-2026.git
cd Software-Practicum-Project-Fall-2026
npm install
```

If you already cloned the repository, obtain the latest merged team changes:

```bash
git checkout main
git pull origin main
npm install
```

 2. Configure your environment

Create a `.env` file in the project root using the actual values provided by the team or Supabase project administrator:

```dotenv
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
APP_URL=http://localhost:5173/set-password
```

The server also supports certain `VITE_SUPABASE_*` fallback variables; see `server/services/supabase.js` for the current configuration. **Never place the service-role key in frontend code, commit `.env`, or share credentials in a screenshot.** The `.env` file is excluded by `.gitignore`.

The project currently relies on database schemas and records managed in Supabase. A full end-to-end migration/seed setup is **not yet included** in the repository, so a new developer may need help from a teammate to provision the same tables and test accounts.

SQL utilities currently included:

- `server/sql/admin-account-management.sql` — creates the protected Admin action audit table.
- `server/sql/prevent-multiple-classroom-groups.sql` — adds a database constraint to prevent multiple group memberships within one classroom (check for duplicates first).

Run these scripts in the Supabase SQL Editor **only when appropriate for your development database** and after reviewing them. Existing data may need cleanup before applying a constraint.

 3. Start the application

```bash
npm run dev
```

This starts both the Express API and React/Vite development servers. Open the URL shown by Vite, normally:

`http://localhost:5173`

Sign in using an account configured in Supabase. The application supports the **Admin**, **Instructor**, **Student**, and **Patient** roles. Demo credentials, if provisioned by your team, should be shared securely rather than hard-coded into public documentation.

### Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the frontend and backend together |
| `npm run dev:web` | Start only the React/Vite frontend |
| `npm run dev:api` | Start only the Express server, with file watching |
| `npm run lint` | Run Oxlint to detect code issues |
| `npm run build` | Create a production-style frontend build in `dist/` |
| `npm run preview` | Preview the built frontend locally |

A successful `npm run build` does not test the Express routes or database permissions. There is no dedicated automated test script in `package.json` yet.

## Typical demonstration workflow

1. **Admin:** Sign in, inspect the user directory, create/manage student accounts or classrooms, and open Classroom & Student Activity to monitor progress.
2. **Instructor:** Open Classes to review an Admin-provisioned classroom and its learners; create student groups as needed.
3. **Student:** Open an assigned case, update the encounter, save SOAP documentation and mock orders, then submit for review.
4. **Instructor:** Open Review & Co-sign, inspect the student's submitted documentation, and approve it or return it with comments.
5. **Student:** Review the feedback and revise any returned documentation.
6. **Patient:** Switch to a configured Patient account to explore the patient overview, care team, appointments, and health insights.

The demonstration requires suitable **preexisting case assignments and related database records**; automated scenario assignment to every classroom is not yet a complete Admin feature.

## Repository guide

```text
src/
  components/             Shared interface elements
  lib/                    API requests, navigation, status helpers
  pages/                  Admin, Instructor, Student, Patient pages
  routes/                 Role-based frontend routing
  App.jsx                 Session state and session restoration
server/
  index.js                Express application entry point
  routes/                 Backend API routes by role/feature
  services/supabase.js    Supabase client configuration
  sql/                    Selected database setup scripts
docs/                     Architecture and database proposals
sprint_deliverables/      Earlier sprint requirements and reports
```

Examples of the current role-specific pages:

- `src/pages/AdminAcademicsPage.jsx` — academic administration and bulk student setup
- `src/pages/AdminUserDirectoryPage.jsx` — account search and management
- `src/pages/AdminActivityPage.jsx` — classroom and student activity monitoring
- `src/pages/InstructorClassesPage.jsx` — classroom and group management
- `src/pages/InstructorReviewPage.jsx` — instructor submission review
- `src/pages/StudentNoteFormPage.jsx` — SOAP documentation editor
- `src/pages/StudentSubmissionPage.jsx` — submission preview and action
- `src/pages/PatientOverviewPage.jsx` — patient overview

## Recent team milestones

| Period | Work integrated into `main` | Pull requests |
| --- | --- | --- |
| September–early October | Early interface, PostgreSQL integration, Supabase authentication, student note/order workflows, Admin patient directory, instructor classroom setup, student class views | 
| October 11–12 | Expanded student case overview and SOAP note experience | 
 |
| October 18 | Bulk student-account creation and additional Admin classroom tools | [#20](https://github.com/quinn-anaiah/Software-Practicum-Project-Fall-2026/pull/20) |
| October 18 | Admin Classroom & Student Activity dashboard, individual student details, and workflow filters |  |
| October 18–19 | Expanded patient portal, care team, appointments, and health insights |  |
| October 19 | Student submission state, note/order locking, instructor review decisions, and student-facing feedback | |

## Known limitations and next steps

1. **Scenario and assignment management:** Complete a reusable scenario library and a consistent Admin/Instructor workflow for assigning cases to particular classes and learners.
2. **Instructor tools:** Add detailed grading rubrics, optional guided expectations, classroom archiving, and comprehensive class-level reporting.
3. **Clinical realism:** Confirm expected accuracy for simulated medications, allergies, diagnoses, interactions, and clinical documentation with the Pharmacy client.
4. **Student workflows:** Improve multi-discipline collaborative notes, patient handoffs, and realistic encounter simulations as requirements become clearer.
5. **Patient portal:** Improve error handling, validate appointment/referral actions, and strengthen backend authorization and patient-data access checks before any wider use.
6. **Security and privacy:** Audit role permissions and database access policies, improve account/session controls, and avoid handling real patient data in the prototype.
7. **Database reproducibility:** Add complete migrations, sample-data seeds, constraints, and clear environment setup instructions.
8. **Quality and deployment:** Add automated unit/integration tests, verify all cross-role workflows, and establish a suitable hosted demonstration environment.

The `docs/instructor-data-model.md` file documents proposed scenario and classroom concepts. It should not be treated as proof that every proposed table or feature has been implemented.

## Team

**Software Practicum, Fall 2026 · Team 4**

- Anaiah Quinn
- Christian Revilla
- Derek Gamboa
- Francisco Vazquez
- Jazmin Huerta

Team 4 has prioritized integration across pharmacy requirements, meaning we have decided to focus later on additional development across fields of study. Further iterations will focus on enhancing the experience but also hopefully implement an AI model or agent across the system. This will give us an advantage on furthering the learning and teaching experience without compromising HIPPA and medical rules or regulations.

---

**Repository:** https://github.com/quinn-anaiah/Software-Practicum-Project-Fall-2026

*CareFlow is a collaborative, evolving university teaching prototype; current functionality may change as client requirements and sprint priorities are refined.*
