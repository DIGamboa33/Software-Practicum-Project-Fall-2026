# CareFlow

**UTEP Software Practicum | Team 4 | Fall 2026**  
**Educational Electronic Health Record (EHR) and Clinical Training Prototype**

> **Status: November 22, 2026.** This document describes functionality reviewed in the repository's `main` branch. The instructor-controlled Simulation Mode and its new database schema are **planned**, not completed. Features described as implemented in code may still require integration testing with the team's configured Supabase database.

## Project overview

CareFlow is a web-based educational EHR prototype designed primarily for pharmacy instruction and potentially future interdisciplinary healthcare training. Students practice clinical workflows using simulated patients: reviewing charts, documenting encounters, entering mock orders, and submitting work for instructor review. Instructors manage classrooms and assignments and evaluate student work. Administrators manage accounts, patient records, classes, and recorded system activity. The prototype also provides patient-facing, front-desk, and billing perspectives.

The project's purpose is to provide UTEP faculty and future development teams with an extensible teaching foundation. **CareFlow is not a production EHR, a medical device, or a validated clinical decision-support system. Do not upload real patient protected health information (PHI).** Use synthetic or appropriately authorized demonstration data.

## Current functionality

| Area | Present in the repository | Limitations and follow-up |
| --- | --- | --- |
| Authentication | Supabase Auth, role/subrole routing, session restoration, account setup and management | Full security testing and operational hardening |
| Administration | Operations statistics, user and patient directories, patient chart details, bulk account creation, classroom creation, discipline eligibility, instructor assignments | Further permissions and end-to-end validation |
| Classroom activity | Rosters, groups, counts, case status, SOAP workflow status, orders, activity filters | Reflects current state rather than chronological audit history |
| Global audit log | Event history, filters by user/role/action, readable details, CSV export, export-event logging, confidentiality confirmation | Not a complete or independently verified compliance audit system |
| Instructor | Assigned classes and groups, announcements, case assignments, saved drafts, submission review, rubric scoring and feedback | Simulation activation and exam lifecycle still outstanding |
| Student | Assigned cases, class dashboards, patient information, SOAP documentation, mock orders, vitals and lab orders, feedback and grades | Broader interdisciplinary and exam workflows remain in progress |
| Training cases | Separate local example cases for student practice | Not the planned instructor-controlled Simulation Mode |
| Patient portal | Health overview, care team, appointments, health insights and related records | Not integrated with real medical systems |
| Front Desk | Intake, appointment management, referral scheduling, insurance details | Requires additional workflow and authorization testing |
| Billing | Claim queue and history, claim status updates, CPT/ICD-10 selections | Client confirmation needed on billing responsibilities and diagnosis-code editing |
| Deployment | Frontend hosted on Vercel, Express backend on Railway, PostgreSQL/Auth on Supabase | Monitoring, hardening and cross-role testing needed |
| Simulation Mode | Schema design planned by teammate | No completed new simulation schema or exam-specific controls verified on `main` |

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8 |
| Backend | Node.js, Express 5 |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| Database client | `@supabase/supabase-js` |
| UI and charts | Project CSS/components, Recharts, React Select |
| Hosting | Vercel (frontend), Railway (API), Supabase (database/auth) |
| Collaboration | Git, GitHub, npm, Oxlint |

### Application architecture

```text
Admin / Instructor / Student / Patient
(Front Desk and Billing as student subroles)
                |
                v
     React + Vite frontend
  Local: http://localhost:5173
       Hosted: Vercel
                |
           /api/* calls
                v
      Express + Node.js API
  Local: http://localhost:3001
       Hosted: Railway
                |
                v
   Supabase Auth + PostgreSQL
      |-- public: profiles, roles, subroles, admin_audit_log
      |-- school: classrooms, instructors, enrollments, groups
      |-- learning: case assignments, notes, reviews, orders
      |-- patient-related records, appointments, referrals
      `-- billing: claims

   Simulation-specific schema: in preparation; not documented as deployed
```

Locally, Vite proxies `/api` requests to the Express service. In production, `vercel.json` rewrites `/api/:path*` to the Railway backend. Server-side API routes authenticate requests and access Supabase. The service-role key must never be exposed to browser code.

## User roles and workflows

### Administrator

The Admin workspace provides an operations overview; searchable user and patient directories; account invitations, permission updates, password-reset requests and activation/deactivation; and patient chart details. Academic tools support creating classrooms, selecting allowed disciplines, enrolling/provisioning accounts and assigning or removing instructors. The Classroom Activity dashboard summarizes current enrollment, groups, student and encounter progress.

**Global Audit Log:** Administrators can view recorded events across multiple roles, filter them by person, role or action, and inspect event details. An **Export to CSV** action downloads matching audit history, including the records across paginated result pages. The interface presents a confidentiality confirmation before exporting, and a protected backend endpoint creates an `audit.export_initiated` event with the administrator, selected filters and frontend-reported record count. This event indicates an attempted/initiated export, **not independently verified file delivery**. The reduced CSV does not include every internal event detail but may still contain sensitive identifiers.

### Instructor

Instructors can view assigned classrooms and rosters, create groups, manage eligible students and publish classroom announcements. Case assignment supports preparing simulated patient scenarios, prefilling from a selected simulated patient, defining rubric criteria, saving drafts and assigning work to a class, group or selected students where supported by the existing workflow.

In the **Review & Cosign** workflow, instructors inspect submitted student work, score applicable rubric criteria, approve the submission or return it with written comments. Rubric scores and feedback are available in corresponding student views.

### Student

Students can open **My Classes** and assigned cases; review patient demographics, medical history and clinical data; document SOAP notes; enter mock orders and supported vitals/laboratory information; and submit their work. Students receive feedback and grades and can revise returned work. Documentation review statuses include **Draft**, **Pending Review**, **Approved** and **Returned**; encounter status is tracked separately.

A separate **Training Cases** route uses example cases in `src/lib/trainingcases.js`. It is **not** the proposed exam-style Simulation Mode.

### Patient

Patient-facing views demonstrate simulated health information, care-team details, appointments, referrals and health insights. These actions do not represent integrations with actual hospitals, insurers or clinical EHR services.

### Front Desk and Billing

Front Desk and Billing use dedicated pages and API routes and are currently represented as **Student subroles**, rather than independent top-level roles in `AppRouter.jsx`.

- **Front Desk:** Patient intake, insurance information, appointments, walk-in and referral workflows.
- **Billing:** Simulated claims, queue/history, CPT/ICD-10 selections and status updates.

**Pending client clarification:** The current Billing view still exposes ICD-10 diagnosis-code editing. The team should resolve which coding activities belong to Billing before describing this design as final. No actual insurance claims or payments are processed.

## Planned instructor-controlled Simulation Mode

**Status: Design in progress.** A teammate is preparing a new simulation database schema. This README does not assume table names, columns, constraints, API endpoints, or deployment readiness before that schema is available and reviewed.

The client has requested a mode in which an instructor can activate a simulation or assessment for students. The proposed high-level experience is:

1. Instructor selects/configures an assessment for an intended classroom or learner group.
2. Instructor activates the simulation.
3. Students complete simulated patient-case tasks under the defined rules.
4. Instructor reviews submissions and evaluates performance.

This should build upon already-existing case assignment, documentation and rubric-based review, but the **activation lifecycle, exam rules, backend access enforcement and simulation-specific persistence remain to be implemented**. The preexisting Training Cases route must not be confused with this feature.

**Update this section after the schema merges:** Add actual schema/table definitions and migration filename(s), relationships, access controls, lifecycle states, instructor/student endpoints, grading rules, and a verified end-to-end demonstration.

## Local setup

### Prerequisites

- Git, Node.js and npm compatible with the repository's Vite version.
- Team-provisioned access to Supabase schemas and synthetic demo accounts.

### Clone and install

```bash
git clone https://github.com/DIGamboa33/Software-Practicum-Project-Fall-2026.git
cd Software-Practicum-Project-Fall-2026
npm install
```

For an existing checkout:

```bash
git switch main
git pull origin main
npm install
```

### Environment variables

Create `.env` at the repository root using **privately provided development credentials**:

```dotenv
SUPABASE_URL=your_supabase_project_url
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
APP_URL=http://localhost:5173/set-password
```

See `server/services/supabase.js` for supported environment-variable names. Never commit `.env`, passwords or keys. Keep the Supabase service-role key server-only.

### Start the application

```bash
npm run dev
```

This launches the API and frontend. Open the Vite URL, usually `http://localhost:5173`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start frontend and backend |
| `npm run dev:web` | Start React/Vite only |
| `npm run dev:api` | Start Express API only |
| `npm run build` | Build the frontend in `dist/` |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Preview the frontend build |

`npm run build` validates the frontend build, **not** the correctness of live backend endpoints or database permissions. The root `package.json` does not include a dedicated automated test command.

### Database setup notes

The project relies on Supabase schemas that have been configured during development. A complete, reproducible, from-scratch migration and seed sequence has not been independently verified. Selected scripts in `server/sql/` include:

- `admin-account-management.sql` for the audit table and permissions.
- `extend-global-audit-log.sql` for entity references and indexes.
- `classroom-announcements.sql` for class announcements.
- `prevent-multiple-classroom-groups.sql` for a group-membership constraint.

Review scripts before running them in Supabase SQL Editor. Their presence does not mean every dependent schema is included in the repository.

## Hosted deployment

The team currently hosts the **Vercel React frontend**, **Railway Express API**, and **Supabase PostgreSQL/Auth** separately. The committed `vercel.json` forwards `/api/*` to Railway and supports frontend SPA routing. Check the team's active deployment settings for the latest demo URL and environment configuration. Secrets should not appear in GitHub documentation.

## Demonstration walkthrough

Use only synthetic accounts and cases:

1. **Admin:** Open Operations, inspect/create a class, configure eligible disciplines, assign an instructor, and view a patient chart.
2. **Instructor:** Open assigned classes, manage students/groups, prepare a case and rubric, and assign work.
3. **Student:** Open the assigned case, review the simulated patient, complete documentation/orders and submit.
4. **Instructor:** Review, score, approve or return the submission.
5. **Student:** View feedback/grades and revise returned work if needed.
6. **Admin:** View classroom activity, inspect Global Audit Log, filter results and export an audit CSV.
7. **Additional workflows:** Demonstrate Patient, Front Desk and Billing views with configured test records.

The *instructor-controlled Simulation Mode* is not included in this walkthrough until implemented and tested.

## Repository structure

```text
src/
  components/                  Reusable UI, case and review components
  lib/                         API functions, navigation and training examples
  pages/                       Role-specific frontend pages
  routes/AppRouter.jsx         Role-based frontend page routing
  App.jsx                      Application-level session behavior
server/
  index.js                     Express entry point
  routes/                      REST endpoints by feature/role
  middleware/requireRole.js    Role/subrole API authorization middleware
  services/                    Supabase and audit utilities
  sql/                         Selected database scripts
docs/                          Planning and data-model notes
sprint_deliverables/           Team sprint documentation
vite.config.js                 Local API proxy
vercel.json                    Production API rewrite configuration
```

Useful implementation references include `AdminGlobalAuditLogPage.jsx`, `AdminAcademicsPage.jsx`, `InstructorClassesPage.jsx`, `AssignCaseModal.jsx`, `InstructorReviewPage.jsx`, `ReviewDecisionPanel.jsx`, `StudentCaseDetailsPage.jsx`, `FrontDeskDashboardPage.jsx` and `BillingDasboardPage.jsx` (current filename spelling).

## Security, privacy and limitations

CareFlow includes role-aware routes, selected audit logging and export tracking. These are useful **HIPAA-aligned design measures**, not evidence that the application meets all HIPAA requirements. A production use case with real PHI would require full legal/security assessment, appropriate vendor agreements, database and application access-control review, audit coverage and retention, secure deployment and backups, incident processes and protection of downloaded data. Use synthetic data for teaching and demos.

Remaining priorities are: implement and test Simulation Mode after the schema review; confirm Billing scope with the client; add more complete database migrations and test data; verify patient-level authorization, account/session behavior and cross-role security; validate the clinical realism expected by the client; and add automated API/integration testing.

## Team

**UTEP Software Practicum, Fall 2026 | Team 4**

- Anaiah Quinn
- Christian Revilla
- Derek Gamboa
- Francisco Vazquez
- Jazmin Huerta

**Repository:** https://github.com/DIGamboa33/Software-Practicum-Project-Fall-2026

*This project is an evolving educational prototype. Features and schema details may change as the final sprint progresses.*
