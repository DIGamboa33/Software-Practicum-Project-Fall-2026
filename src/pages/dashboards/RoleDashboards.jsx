import { useEffect, useState } from "react";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Icon from "../../components/Icon";
import { fetchAdminUsers } from "../../lib/api";

const ADMIN_CHART_COLORS = ["#6277d8", "#45bca2", "#f0a650", "#a175d8"];

const dashboardContent = {
  Instructor: {
    eyebrow: "Instructor workspace",
    title: "Teaching workspace",
    description:
      "Cohort activity, scenario progress, and submitted work will load here from your assigned classrooms.",
    areas: ["Assigned classrooms", "Scenario progress", "Review queue"],
  },

  Patient: {
    eyebrow: "My health",
    title: "Your care portal",
    description:
      "Appointments, care-team information, and clinical updates will appear here once they are connected to your profile.",
    areas: ["Upcoming appointments", "Care team", "Health updates"],
  },

  Student: {
    eyebrow: "My cases",
    title: "Your learning workspace",
    description:
      "Assigned scenarios, encounter progress, and documentation requirements will appear here when an instructor assigns a case.",
    areas: ["Assigned cases", "Documentation", "Instructor feedback"],
  },
};


// Finds how many users belong to a certain role.
function getRoleCount(stats, roleName) {
  if (!stats) {
    return 0;
  }

  const role = stats.roleBreakdown?.find(
    (item) => item.name === roleName,
  );

  return role ? role.count : 0;
}


// Admin Operations dashboard.
function AdminOperationsDashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOverview() {
      try {
        setIsLoading(true);
        setError("");

        // This already exists for the Global User Search page.
        const result = await fetchAdminUsers();

        setStats(result.stats);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the operations overview.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadOverview();
  }, []);


  if (isLoading) {
    return (
      <div className="dashboard-page content-page">
        <p>Loading operations overview...</p>
      </div>
    );
  }


  if (error) {
    return (
      <div className="dashboard-page content-page">
        <section className="page-heading">
          <div>
            <p className="section-label">Administration</p>

            <h1>Operations overview</h1>

            <p>{error}</p>
          </div>
        </section>
      </div>
    );
  }


  const patients = getRoleCount(stats, "Patient");
  const instructors = getRoleCount(stats, "Instructor");
  const students = getRoleCount(stats, "Student");
  const admins = getRoleCount(stats, "Admin");


  const overviewCards = [
    {
      label: "Total accounts",
      value: stats?.totalUsers || 0,
      description: "All Careflow user accounts",
      icon: "grid",
    },

    {
      label: "Patients",
      value: patients,
      description: "Registered patient accounts",
      icon: "patients",
    },

    {
      label: "Instructors",
      value: instructors,
      description: "Instructor accounts",
      icon: "chart",
    },

    {
      label: "Students",
      value: students,
      description: "Student accounts",
      icon: "calendar",
    },

    {
      label: "New this week",
      value: stats?.newThisWeek || 0,
      description: "Accounts created during the last 7 days",
      icon: "plus",
    },

    {
      label: "Instructor cases",
      value: "—",
      description: "Scenario database not connected yet",
      icon: "grid",
    },
  ];

  const roleBreakdown = stats?.roleBreakdown || [];


  return (
    <div className="dashboard-page content-page role-dashboard">

      {/* Heading */}
      <section className="page-heading">
        <div>
          <p className="section-label">
            Administration
          </p>

          <h1>
            Welcome back, {user.name.split(" ")[0]}
          </h1>

          <p>
            Overview of Careflow users, patients, instructors,
            students, and system activity.
          </p>
        </div>
      </section>


      {/* Main statistics */}
      <section className="role-dashboard__areas">

        {overviewCards.map((card) => (
          <article
            className="panel role-dashboard__area"
            key={card.label}
          >
            <div className="role-dashboard__card-heading">
              <p className="section-label">
                {card.label}
              </p>
              <span className={`role-dashboard__card-icon role-dashboard__card-icon--${card.icon}`}>
                <Icon name={card.icon} size={17} />
              </span>
            </div>

            <h2
              style={{
                fontSize: "36px",
                marginTop: "10px",
                marginBottom: "8px",
              }}
            >
              {card.value}
            </h2>

            <p>
              {card.description}
            </p>
          </article>
        ))}

      </section>

      <section className="panel admin-visual-card admin-operations-chart">
        <div className="panel__header">
          <div>
            <p className="section-label">Account composition</p>
            <h2>Careflow users by role</h2>
          </div>
          <span className="admin-visual-caption">Live directory data</span>
        </div>
        {roleBreakdown.length ? (
          <div className="admin-visual-canvas admin-visual-canvas--donut">
            <ResponsiveContainer height="100%" width="100%">
              <PieChart>
                <Pie
                  data={roleBreakdown}
                  dataKey="count"
                  innerRadius={58}
                  nameKey="name"
                  outerRadius={86}
                  paddingAngle={3}
                >
                  {roleBreakdown.map((role, index) => (
                    <Cell
                      fill={ADMIN_CHART_COLORS[index % ADMIN_CHART_COLORS.length]}
                      key={role.name}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} accounts`, "Users"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="directory-loading">Role distribution will appear once accounts are created.</p>
        )}
      </section>


      {/* Additional system information */}
      <section className="panel role-dashboard__notice">

        <span>↗</span>

        <div>
          <p className="section-label">
            System overview
          </p>

          <h2>
            Careflow database is connected
          </h2>

          <p>
            {patients} patients, {instructors} instructors,
            {" "}
            {students} students, and {admins} administrators
            are currently registered in Careflow.
          </p>

          <p>
            {stats?.usersWithSubrole || 0} users currently have
            a discipline or subrole assigned.
          </p>
        </div>

      </section>

    </div>
  );
}


function RoleDashboard({ user }) {

  // Admin gets the real database-backed Operations dashboard.
  if (user.role === "Admin") {
    return <AdminOperationsDashboard user={user} />;
  }


  // Other roles continue using their current dashboard.
  const content =
    dashboardContent[user.role] ||
    dashboardContent.Patient;


  return (
    <div className="dashboard-page content-page role-dashboard">

      <section className="page-heading">
        <div>

          <p className="section-label">
            {content.eyebrow}
          </p>

          <h1>
            Welcome back, {user.name.split(" ")[0]}
          </h1>

          <p>
            {content.description}
          </p>

        </div>
      </section>


      <section className="role-dashboard__areas">

        {content.areas.map((area) => (
          <article
            className="panel role-dashboard__area"
            key={area}
          >

            <p className="section-label">
              Database connection pending
            </p>

            <h2>
              {area}
            </h2>

            <p>
              No records to display yet.
            </p>

          </article>
        ))}

      </section>


      <section className="panel role-dashboard__notice">

        <span>↗</span>

        <div>

          <p className="section-label">
            Next integration step
          </p>

          <h2>
            {content.title} is database-ready
          </h2>

          <p>
            This dashboard will request only the records
            authorized for your role after its API endpoint
            is added.
          </p>

        </div>

      </section>

    </div>
  );
}


export default RoleDashboard;
