import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import {
  adminNavigation,
  instructorNavigation,
  patientNavigation,
  studentNavigation,
} from "../lib/navigation";
import DatabasePlaceholderPage from "../pages/DatabasePlaceholderPage";
import AdminUserDirectoryPage from "../pages/AdminUserDirectoryPage";
import AdminAcademicsPage from "../pages/AdminAcademicsPage";
import AdminPatientsPage from "../pages/AdminPatientsPage";
import AdminPatientDetailPage from "../pages/AdminPatientDetailPage";
import DashboardPage from "../pages/DashboardPage";
import InstructorClassesPage from "../pages/InstructorClassesPage";
import InstructorOverviewPage from "../pages/InstructorOverviewPage";
import InstructorReviewPage from "../pages/InstructorReviewPage";
import InstructorPatientsPage from "../pages/InstructorPatientsPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import PasswordSetupPage from "../pages/PasswordSetupPage";
import SettingsPage from "../pages/SettingsPage";
import StudentOverviewPage from "../pages/StudentOverviewPage";
import StudentCaseDetailsPage from "../pages/StudentCaseDetailsPage";
import PharmacyNotesPage from "../pages/PharmacyNotesPage";
import StudentOrderEntryPage from "../pages/StudentOrderEntryPage";
import StudentClassesPage from "../pages/StudentClassesPage";
import StudentClassDetailPage from "../pages/StudentClassDetailPage";
import PatientOverviewPage from "../pages/PatientOverviewPage";
import PatientCareTeamPage from "../pages/PatientCareTeamPage";
import PatientAppointmentsPage from "../pages/PatientAppointmentsPage";
import PatientHealthInsightsPage from "../pages/PatientHealthInsightsPage";

import AdminActivityPage from "../pages/AdminActivityPage";

function placeholder(path, eyebrow, title, description) {
  return { path, eyebrow, title, description };
}

const routesByRole = {
  Admin: {
    navigation: adminNavigation,
    pages: {
      overview: { path: "/admin", Component: DashboardPage },
      users: { path: "/admin/users", Component: AdminUserDirectoryPage },
      academics: { path: "/admin/academics", Component: AdminAcademicsPage },
      patients: { path: "/admin/patients", Component: AdminPatientsPage },
      patientDetail: { path: "/admin/patient", Component: AdminPatientDetailPage },
      activity: { path: "/admin/activity", Component: AdminActivityPage },
      settings: { path: "/admin/settings", Component: SettingsPage },
    },
  },
  Instructor: {
    navigation: instructorNavigation,
    pages: {
      overview: { path: "/instructor", Component: InstructorOverviewPage },
      cohorts: { path: "/instructor/cohorts", Component: InstructorClassesPage },
      cases: placeholder(
        "/instructor/cases",
        "Scenario library",
        "No training scenarios yet",
        "Reusable scenarios will appear here. Assign them to a class from the Classes workspace.",
      ),
      expectations: placeholder(
        "/instructor/expectations",
        "Expectations",
        "No expectations configured yet",
        "Rubrics, documentation requirements, and clinical traps will be loaded from the database.",
      ),
      monitoring: placeholder(
        "/instructor/monitoring",
        "Monitor activity",
        "No learner activity yet",
        "Encounter states and submission progress will appear here when cases are assigned.",
      ),
      review: {
        path: "/instructor/review",
        Component: InstructorReviewPage,
      },
      feedback: placeholder(
        "/instructor/feedback",
        "Feedback & grades",
        "No work available for grading",
        "Rubric scores, annotations, and feedback will load here once submissions exist.",
      ),
      oversight: placeholder(
        "/instructor/oversight",
        "Cohort oversight",
        "No cohort analytics yet",
        "Aggregate performance and audit activity will appear here when database reporting is connected.",
      ),
      patients: {
        path: "/instructor/patients",
        Component: InstructorPatientsPage,
      },
      closeout: placeholder(
        "/instructor/closeout",
        "Closeout",
        "No cases ready for closeout",
        "Completion, grade release, and archiving controls will appear here for completed scenarios.",
      ),
      settings: { path: "/instructor/settings", Component: SettingsPage },
    },
  },
  Patient: {
    navigation: patientNavigation,
    pages: {
      overview: { path: "/patient", Component: PatientOverviewPage },
      careTeam: { path: "/patient/care-team", Component: PatientCareTeamPage},
      appointments: {path: "/patient/appointments", Component: PatientAppointmentsPage},
      insights: { path: "/patient/health-insights", Component: PatientHealthInsightsPage},
      settings: { path: "/patient/settings", Component: SettingsPage },
    },
  },
  Student: {
    navigation: studentNavigation,
    pages: {
      overview: { path: "/student", Component: StudentOverviewPage },
      classes: { path: "/student/classes", Component: StudentClassesPage },
      classDetail: { path: "/student/class", Component: StudentClassDetailPage },
      caseDetail: {
        path: "/student/case",
        Component: StudentCaseDetailsPage,
      },
      pharmacyNotes: {
        path: "/student/pharmacy-notes",
        Component: PharmacyNotesPage,
      },
      orderEntry: {
        path: "/student/orders",
        Component: StudentOrderEntryPage,
      },
      settings: { path: "/student/settings", Component: SettingsPage },
    },
  },
};

function getRouteConfig(role) {
  return routesByRole[role] || routesByRole.Patient;
}

function getDefaultPath(user) {
  return user ? getRouteConfig(user.role).pages.overview.path : "/login";
}

function DashboardRoute({ onLogout, user }) {
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return <Navigate replace to="/login" />;

  const routeConfig = getRouteConfig(user.role);
  const activePageEntry = Object.entries(routeConfig.pages).find(
    ([, page]) => page.path === location.pathname,
  );

  if (!activePageEntry) {
    return <Navigate replace to={routeConfig.pages.overview.path} />;
  }

  const [activePage, page] = activePageEntry;

  function navigateTo(pageId, options = {}) {
    const path =
      routeConfig.pages[pageId]?.path ||
      routeConfig.pages.overview.path;

    if (options.caseId) {
      navigate(`${path}?id=${options.caseId}`);
      return;
    }

    navigate(path);
  }

  const ActivePage = page.Component;
  const content = ActivePage ? (
    <ActivePage user={user} onNavigate={navigateTo} />
  ) : (
    <DatabasePlaceholderPage {...page} />
  );

  return (
    <DashboardLayout
      activePage={activePage}
      navItems={routeConfig.navigation}
      onLogout={onLogout}
      onNavigate={navigateTo}
      user={user}
    >
      {content}
    </DashboardLayout>
  );
}

function AppRouter({ onLogin, onLogout, user }) {
  const navigate = useNavigate();

  function handleLogin(authenticatedUser) {
    onLogin(authenticatedUser);
    navigate(getDefaultPath(authenticatedUser), { replace: true });
  }

  function handleLogout() {
    onLogout();
    navigate("/login", { replace: true });
  }

  const protectedRoute = <DashboardRoute onLogout={handleLogout} user={user} />;

  return (
    <Routes>
      <Route
        element={
          user ? (
            <Navigate replace to={getDefaultPath(user)} />
          ) : (
            <LoginPage onLogin={handleLogin} />
          )
        }
        path="/login"
      />
      <Route
        element={
          user ? (
            <Navigate replace to={getDefaultPath(user)} />
          ) : (
            <RegisterPage />
          )
        }
        path="/register"
      />
      <Route element={<PasswordSetupPage />} path="/set-password" />
      <Route element={protectedRoute} path="/instructor/*" />
      <Route element={protectedRoute} path="/admin/*" />
      <Route element={protectedRoute} path="/patient/*" />
      <Route element={protectedRoute} path="/student/*" />
      <Route element={<Navigate replace to={getDefaultPath(user)} />} path="*" />
    </Routes>
  );
}

export default AppRouter;
