
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAdminActivity } from "../lib/api";
import "./AdminActivityPage.css";

// Convert a database date into something readable.
function formatDate(dateText) {
  if (!dateText) {
    return "Not updated";
  }

  const date = new Date(dateText);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

function AdminActivityPage() {

  // Information received from the backend.
  const [dashboard, setDashboard] = useState(null);

  // Loading and error messages.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Classroom filter and search.
  const [selectedClassroom, setSelectedClassroom] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [activityFilter, setActivityFilter] = useState("all");

  // The student currently selected by the Admin.
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Reload data when the Admin clicks Refresh.
  async function loadActivity() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchAdminActivity();
      setDashboard(result);

    } catch (err) {
      setDashboard(null);
      setError(err.message);

    } finally {
      setLoading(false);
    }
  }

  // Load activity when the page first opens.
  useEffect(() => {
    let isCurrent = true;

    fetchAdminActivity()
      .then((result) => {
        if (isCurrent) {
          setDashboard(result);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          setDashboard(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    // Prevent old requests from updating the page.
    return () => {
      isCurrent = false;
    };
  }, []);

  // Use empty arrays while waiting for the API.
  const classrooms = dashboard?.classrooms || [];
  const activity = dashboard?.activity || [];

  const search = searchText.trim().toLowerCase();

  // Filter classrooms.
  const visibleClassrooms = classrooms.filter((classroom) => {
    if (selectedClassroom === "all") {
      return true;
    }

    return String(classroom.id) === selectedClassroom;
  });

  // Create the student roster from classroom enrollments.
  const studentRoster = [];

  for (const classroom of visibleClassrooms) {
    for (const student of classroom.students) {

      const matchesSearch = student.name
        .toLowerCase()
        .includes(search);

      if (matchesSearch) {
        studentRoster.push({
          ...student,
          classroomId: classroom.id,
          classroomName: classroom.short_name,
        });
      }
    }
  }

  // Find student IDs belonging to the selected classroom.
  const classroomStudentIds = [];

  for (const classroom of visibleClassrooms) {
    for (const student of classroom.students) {
      classroomStudentIds.push(student.id);
    }
  }

  // Filter the case activity table.
  const visibleActivity = activity.filter((item) => {
    //First, check if the student belongs to the selected classroom.
    let belongsToClassroom = true;

    if (selectedClassroom !== "all") {
      belongsToClassroom = classroomStudentIds.includes(
        item.studentId
      );
    }

    //Second, check if the case matches the search text.
    const matchesSearch =
      item.studentName.toLowerCase().includes(search) ||
      item.caseTitle.toLowerCase().includes(search);

    // Third, check if the case matches the activity filter.
    const noteStatus = (item.noteStatus || "Not Started").toLowerCase();
    const encounterStatus = (item.encounterStatus || "Not Started").toLowerCase();

    // An ecounter is unfinished until its status is "checked out"
    const unfinishedEncounter = encounterStatus !== "checked out";

    // These note status mean more work is needed
    const unfinishedNote = ["not started", "draft", "returned"].includes(noteStatus);

    let matchesActivityFilter = true;

    switch (activityFilter) {
      case "attention":
        matchesActivityFilter = unfinishedEncounter || unfinishedNote;
        break;

      case "unsubmitted":
        matchesActivityFilter = unfinishedNote;
        break;
      case "no-note":
        matchesActivityFilter = noteStatus === "not started";
        break;
      case "draft":
        matchesActivityFilter = noteStatus === "draft" || noteStatus === "returned";
        break;
      case "encounter":
        matchesActivityFilter = unfinishedEncounter;
        break;
      default:
        matchesActivityFilter = true;
    }

    return belongsToClassroom && matchesSearch && matchesActivityFilter;
  });

  const classroomEnrollmentData = useMemo(
    () => visibleClassrooms.map((classroom) => ({
      name: classroom.short_name || classroom.full_name,
      students: classroom.studentCount || classroom.students.length,
    })),
    [visibleClassrooms],
  );
  const noteStatusData = useMemo(() => {
    const totals = visibleActivity.reduce((counts, item) => {
      const status = item.noteStatus || "Not Started";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});

    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [visibleActivity]);

  // Find the student selected by the Admin.
  const selectedStudent = studentRoster.find(
    (student) => student.id === selectedStudentId
  );

  // Find every classroom the selected student belongs to.
  const selectedStudentClassrooms = classrooms.filter((classroom) => {
    return classroom.students.some(
      (student) => student.id === selectedStudentId
    );
  });

  // Find every case assigned to the selected student.
  const selectedStudentCases = activity.filter((item) => {
    return item.studentId === selectedStudentId;
  });

  // Update the selected classroom.
  function changeClassroom(event) {
    setSelectedClassroom(event.target.value);

    // Close student details when changing classrooms.
    setSelectedStudentId(null);
  }

  return (
    <div className="dashboard-page content-page admin-activity-page">

      {/* PAGE HEADING */}
      <section className="page-heading">
        <div>
          <p className="section-label">
            Administration / System Oversight
          </p>

          <h1>Classroom & Student Activity</h1>

          <p>
            Monitor classroom enrollment and individual
            student learning progress.
          </p>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={loadActivity}
          disabled={loading}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {/* LOADING */}
      {loading && (
        <section className="panel admin-activity-message">
          Loading classroom and student activity...
        </section>
      )}

      {/* ERROR */}
      {error && (
        <section className="panel directory-error" role="alert">
          {error}
        </section>
      )}

      {!loading && dashboard && (
        <>

          {/* FILTERS */}
          <section className="panel admin-activity-filters">
            <label>
              Select Classroom

              <select
                value={selectedClassroom}
                onChange={changeClassroom}
              >
                <option value="all">All Classrooms</option>

                {classrooms.map((classroom) => (
                  <option
                    key={classroom.id}
                    value={String(classroom.id)}
                  >
                    {classroom.full_name} - {classroom.term}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Search

              <input
                type="search"
                placeholder="Search students or cases..."
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setSelectedStudentId(null);
                }}
              />
            </label>

            <label>
              Activity Status

              <select
                value={activityFilter}
                onChange={(event) => setActivityFilter(event.target.value)}
              >
                <option value="all">All Cases</option>
                <option value="attention">Needs Attention</option>
                <option value="unsubmitted">SOAP Not Submitted</option>
                <option value="no-note">No SOAP Note Started</option>
                <option value="draft">SOAP Draft or Returned</option>
                <option value="encounter">Unfinished Encounter</option>
              </select>
            </label>
          </section>

          <section className="admin-activity-analytics">
            <article className="panel admin-visual-card">
              <div className="panel__header">
                <div>
                  <p className="section-label">Enrollment snapshot</p>
                  <h2>Students per classroom</h2>
                </div>
              </div>
              {classroomEnrollmentData.length ? (
                <div className="admin-visual-canvas admin-visual-canvas--activity">
                  <ResponsiveContainer height="100%" width="100%">
                    <BarChart data={classroomEnrollmentData} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid stroke="#edf0f5" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [`${value} students`, "Enrollment"]} />
                      <Bar dataKey="students" fill="#6277d8" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p>No classroom enrollment data matches the current filters.</p>}
            </article>

            <article className="panel admin-visual-card">
              <div className="panel__header">
                <div>
                  <p className="section-label">Documentation progress</p>
                  <h2>SOAP note status mix</h2>
                </div>
              </div>
              {noteStatusData.length ? (
                <div className="admin-visual-canvas admin-visual-canvas--activity">
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Pie data={noteStatusData} dataKey="value" innerRadius={48} nameKey="name" outerRadius={72} paddingAngle={3}>
                        {noteStatusData.map((item, index) => <Cell fill={["#6277d8", "#45bca2", "#f0a650", "#d87070"][index % 4]} key={item.name} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} assignments`, "Cases"]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <p>No case activity matches the current filters.</p>}
            </article>
          </section>

          {/* CLASSROOM TABLE */}
          <section className="panel admin-activity-section">
            <h2>All Classrooms</h2>

            {visibleClassrooms.length === 0 ? (
              <p>No classrooms found.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Classroom</th>
                      <th>CRN</th>
                      <th>Term</th>
                      <th>Instructor</th>
                      <th>Students</th>
                      <th>Groups</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleClassrooms.map((classroom) => (
                      <tr key={classroom.id}>
                        <td>
                          <strong>{classroom.full_name}</strong>
                          <small>{classroom.short_name}</small>
                        </td>

                        <td>{classroom.crn}</td>
                        <td>{classroom.term}</td>

                        <td>
                          {classroom.instructorNames.join(", ") ||
                            "Not assigned"}
                        </td>

                        <td>
                          {classroom.studentCount}
                          <small>
                            {classroom.activeStudentCount} active
                          </small>
                        </td>

                        <td>{classroom.groupCount}</td>

                        <td>
                          <span className="admin-activity-status">
                            {classroom.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* STUDENT ROSTER AND DETAILS */}
          <div
            className={
              selectedStudent
                ? "admin-activity-student-layout admin-activity-student-layout--open"
                : "admin-activity-student-layout"
            }
          >

            {/* STUDENT ROSTER */}
            <section className="panel admin-activity-section">
              <h2>Student Roster</h2>

              <p>
                {studentRoster.length} enrollment records
                match your filters.
              </p>

              {studentRoster.length === 0 ? (
                <p>No enrolled students found.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Classroom</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {studentRoster.map((student) => (
                        <tr
                          key={`${student.classroomId}-${student.id}`}
                        >
                          <td>
                            <strong>{student.name}</strong>
                          </td>

                          <td>{student.classroomName}</td>

                          <td>
                            <span className="admin-activity-status">
                              {student.status || "Unknown"}
                            </span>
                          </td>

                          <td>
                            <button
                              className="admin-activity-view-button"
                              type="button"
                              aria-expanded={
                                selectedStudentId === student.id
                              }
                              onClick={() => {
                                setSelectedStudentId(student.id);
                              }}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* SELECTED STUDENT DETAILS */}
            {selectedStudent && (
              <aside
                className="panel admin-activity-details"
                aria-label="Student activity details"
              >

                <div className="admin-activity-details-header">
                  <div>
                    <p className="section-label">
                      Student Activity Details
                    </p>

                    <h2>{selectedStudent.name}</h2>
                  </div>

                  <button
                    className="admin-activity-close-button"
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(null);
                    }}
                  >
                    Close
                  </button>
                </div>

                {/* STUDENT'S CLASSES */}
                <div className="admin-activity-details-section">
                  <h3>
                    Enrolled Classrooms
                    ({selectedStudentClassrooms.length})
                  </h3>

                  {selectedStudentClassrooms.length === 0 ? (
                    <p>No classroom enrollments found.</p>
                  ) : (
                    selectedStudentClassrooms.map((classroom) => {

                      const enrollment = classroom.students.find(
                        (student) => student.id === selectedStudentId
                      );

                      return (
                        <div
                          className="admin-activity-detail-item"
                          key={classroom.id}
                        >
                          <strong>{classroom.full_name}</strong>

                          <p>
                            {classroom.short_name} · {classroom.term}
                          </p>

                          <p>
                            Enrollment: {enrollment?.status || "Unknown"}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* STUDENT'S CASES */}
                <div className="admin-activity-details-section">
                  <h3>
                    Assigned Cases ({selectedStudentCases.length})
                  </h3>

                  {selectedStudentCases.length === 0 ? (
                    <p>
                      This student has no assigned cases.
                    </p>
                  ) : (
                    selectedStudentCases.map((item) => (
                      <div
                        className="admin-activity-detail-item"
                        key={item.id}
                      >
                        <strong>{item.caseTitle}</strong>

                        <div className="admin-activity-detail-row">
                          <span>Encounter</span>
                          <span>{item.encounterStatus}</span>
                        </div>

                        <div className="admin-activity-detail-row">
                          <span>SOAP Note</span>
                          <span>{item.noteStatus}</span>
                        </div>

                        <div className="admin-activity-detail-row">
                          <span>Orders</span>
                          <span>{item.orderCount}</span>
                        </div>

                        <div className="admin-activity-detail-row">
                          <span>Updated</span>
                          <span>{formatDate(item.lastUpdated)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <p className="admin-activity-details-note">
                  This panel displays current learning progress.
                  It does not display SOAP note contents,
                  patient medical records, or grades.
                </p>

              </aside>
            )}

          </div>

          {/* ALL STUDENT CASE ACTIVITY */}
          <section className="panel admin-activity-section">
            <h2>Student Case Activity ({visibleActivity.length})</h2>

            <p>
              Current encounter and SOAP documentation progress.
            </p>

            {selectedClassroom !== "all" && (
              <p className="admin-activity-warning">
                Case assignments are linked to students,
                not directly to classrooms. These records
                include all cases belonging to students
                enrolled in the selected classroom.
              </p>
            )}

            {visibleActivity.length === 0 ? (
              <p>No student case activity found.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Case</th>
                      <th>Encounter</th>
                      <th>SOAP Note</th>
                      <th>Orders</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleActivity.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.studentName}</strong>
                        </td>

                        <td>{item.caseTitle}</td>

                        <td>
                          <span className="admin-activity-status">
                            {item.encounterStatus}
                          </span>
                        </td>

                        <td>
                          <span className="admin-activity-status">
                            {item.noteStatus}
                          </span>
                        </td>

                        <td>{item.orderCount}</td>

                        <td>{formatDate(item.lastUpdated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </>
      )}
    </div>
  );
}

export default AdminActivityPage;
