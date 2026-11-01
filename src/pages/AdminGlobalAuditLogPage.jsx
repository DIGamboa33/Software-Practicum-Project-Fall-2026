
import { useEffect, useState } from "react";
import { fetchGlobalAuditLog } from "../lib/api";
import Pagination from "../components/Pagination";
import "./AdminGlobalAuditLogPage.css";


 // Convert database action names into readable labels.
function getActionLabel(entry) {
  const labels = {
    "note.created": "SOAP Note Created",
    "note.updated": "SOAP Note Updated",
    "note.update": "SOAP Note Updated",
    "note.submitted": "SOAP Note Submitted",
    "account.deactivated": "User Account Deactivated",
    "account.activated": "User Account Activated",
    "account.invited": "User Account Invited",
    "account.access_updated": "User Permissions Updated",
    "account.password_reset_requested": "Password Reset Requested",
    "classroom.created": "Classroom Created",
    "student.bulk_invited": "Student Account Created"
  };

  // Instructor reviews can have two different outcomes.
  if (entry.action === "note.reviewed") {
    if (entry.details?.decision === "Returned") {
      return "SOAP Note Returned";
    }

    if (entry.details?.decision === "Approved") {
      return "SOAP Note Approved";
    }

    return "SOAP Note Reviewed";
  }

  // Use our label, or clean up unfamiliar actions.
  return labels[entry.action] ||
    (entry.action || "Unknown Action")
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Explain what happened
function getActionDescription(entry) {
  const noteId = entry.entity_id || "unknown";

  switch (entry.action) {
    case "note.created":
      return `A student created SOAP note #${noteId}.`;

    case "note.updated":
    case "note.update":
      return `A student saved changes to SOAP note #${noteId}.`;

    case "note.submitted":
      return `A student submitted SOAP note #${noteId} for instructor review.`;

    case "note.reviewed":
      if (entry.details?.decision === "Returned") {
        return `An instructor returned SOAP note #${noteId} to the student for revisions.`;
      }

      if (entry.details?.decision === "Approved") {
        return `An instructor approved SOAP note #${noteId}.`;
      }

      return `An instructor reviewed SOAP note #${noteId}.`;

    case "account.deactivated":
      return "An administrator deactivated a user account.";

    case "account.activated":
      return "An administrator reactivated a user account.";

    case "account.invited":
      return "An administrator sent an invitation to a new user.";

    case "account.access_updated":
      return "An administrator changed a user's role or permissions.";

    case "account.password_reset_requested":
      return "An administrator requested a password reset for a user.";

    case "classroom.created":
      return "An administrator created a new classroom.";

    case "student.bulk_invited":
      return "An administrator created a student account.";

    default:
      return `${getActionLabel(entry)} was recorded in the system.`;
  }
}

// Give database fields a more readable label for display.
function getDetailLabel(key) {
  const labels = {
    assignment_id: "Assignment ID",
    decision: "Review Decision",
    previous_status: "Previous Status",
    new_status: "New Status",
    noteType: "Note Type",
    ClassroomId: "Classroom ID",
    instructorId: "Instructor ID",
    previousRole: "Previous Role",
    previousSubrole: "Previous Discipline",
    role: "New Role",
    subrole: "New Discipline",
    isActive: "Account Active",
    crn: "Classroom CRN",
    term: "Classroom Term",
    email: "Email Address",
  };

  return labels[key] || 
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

}

//Turn Database values into more readable values for display.
function getDetailValue(value) {
  if (value == null || value === undefined) {
    return "Not Provided";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (Array.isArray(value)) {
    return value.map(getDetailValue).join(", ");
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `${getDetailLabel(key)}: ${getDetailValue(item)}`)
      .join(", ");
  }
  return String(value);
}




function AdminGlobalAuditLogPage() {
  // Audit events returned from Supabase.
  const [logs, setLogs] = useState([]);

  // Pagination information.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Loading and error messages.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  //audit log search and filters
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedAction, setSelectedAction] = useState("all");

  // Load the events whenever the page number changes.
  useEffect(() => {
    let isCurrent = true;

    fetchGlobalAuditLog(page, {
      search: searchTerm,
      role: selectedRole,
      action: selectedAction
    })
      .then((result) => {
        if (!isCurrent) return;

        setLogs(result.logs);
        setTotal(result.total);
        setPageSize(result.pageSize);
      })
      .catch((err) => {
        if (!isCurrent) return;
        setError(err.message);
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [page, searchTerm, selectedRole, selectedAction]);

  // Move to another page of audit events.
  function handlePageChange(nextPage) {
    setLoading(true);
    setError("");
    setPage(nextPage);
  }


  // Search for events performed by a particular user.
  function handleSearch(event) {
    event.preventDefault();

    const nextSearch = searchInput.trim();

    if (nextSearch !== searchTerm || page !== 1) {
      setLoading(true);
    }

    setError("");
    setPage(1);
    setSearchTerm(nextSearch);
  }

  // Filter events by the user's role.
  function handleRoleChange(event) {
    setLoading(true);
    setError("");
    setPage(1);
    setSelectedRole(event.target.value);
  }

  // Filter events by the type of action.
  function handleActionChange(event) {
    setLoading(true);
    setError("");
    setPage(1);
    setSelectedAction(event.target.value);
  }

  // Remove all active filters.
  function handleClearFilters() {
    if (
      searchTerm ||
      selectedRole !== "all" ||
      selectedAction !== "all" ||
      page !== 1
    ) {
      setLoading(true);
    }

    setError("");
    setSearchInput("");
    setSearchTerm("");
    setSelectedRole("all");
    setSelectedAction("all");
    setPage(1);
  }


  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Administration · Security</p>
          <h1>Global Audit Log</h1>
          <p>
            View recorded Student, Instructor, and Admin activity
            across CareFlow.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="section-label">System activity</p>
            <h2>Audit History</h2>
            <p>{total} recorded {total === 1 ? "event" : "events"}</p>
          </div>
        </div>


        <form className="global-audit-filters" onSubmit={handleSearch}>

          {/* Search for the person who performed the action. */}
          <label>
            Search by User
            <input
              type="search"
              placeholder="e.g. Bart Simpson"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>

          {/* Filter by user role. */}
          <label>
            User Role
            <select
              value={selectedRole}
              onChange={handleRoleChange}
            >
              <option value="all">All Roles</option>
              <option value="Student">Student</option>
              <option value="Instructor">Instructor</option>
              <option value="Admin">Admin</option>
              <option value="Patient">Patient</option>
            </select>
          </label>

          {/* Filter by recorded action. */}
          <label>
            Activity Type
            <select
              value={selectedAction}
              onChange={handleActionChange}
            >
              <option value="all">All Activities</option>

              <option value="note.created">SOAP Note Created</option>
              <option value="note.updated">SOAP Note Updated</option>
              <option value="note.submitted">SOAP Note Submitted</option>
              <option value="note.reviewed">SOAP Note Reviewed</option>

              <option value="account.invited">User Account Invited</option>
              <option value="account.activated">User Account Activated</option>
              <option value="account.deactivated">User Account Deactivated</option>
              <option value="account.access_updated">User Permissions Updated</option>
              <option value="account.password_reset_requested">Password Reset Requested</option>

              <option value="classroom.created">Classroom Created</option>
              <option value="student.bulk_invited">Student Account Created</option>
            </select>
          </label>

          <div className="global-audit-filter-buttons">
            <button type="submit" className="primary-button">
              Search
            </button>

            <button
              type="button"
              className="global-audit-clear-button"
              onClick={handleClearFilters}
            >
              Clear
            </button>
          </div>

        </form>


        {loading && <p>Loading audit logs...</p>}

        {error && <p role="alert">{error}</p>}

        {!loading && !error && logs.length === 0 && (
          <p>No audit events match your current search or filters.</p>
        )}

        {!loading && !error && logs.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Action</th>
                    <th>Performed By</th>
                    <th>Record</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {new Date(entry.created_at).toLocaleString()}
                      </td>

                      <td>
                        <strong>{getActionLabel(entry)}</strong>
                        </td>

                      <td>
                        <div className="audit-actor">
                          <strong className="audit-actor-name">
                            {entry.actor_name || "Unknown user"}
                          </strong>

                          <span className="audit-actor-role">
                            {entry.actor_role || "Role unavailable"}
                          </span>
                        </div>
                      </td>
                      <td>
                        {entry.entity_type || "N/A"}
                        {" #"}
                        {entry.entity_id || "N/A"}
                      </td>

                      <td>
                        <details className="audit-event-details">
                          <summary>View details</summary>
                          <p className="audit-event-description">
                            {getActionDescription(entry)}
                          </p>

                          <dl className="audit-event-fields">

                            <div>
                              <dt>Performed By</dt>
                              <dd>
                                {entry.actor_name || "Unknown user"}
                                {" · "}
                                {entry.actor_role || "Role unavailable"}
                              </dd>
                            </div>

                            <div>
                              <dt>User ID</dt>
                              <dd>{entry.actor_id}</dd>
                            </div>


                            {entry.entity_id && (
                              <div>
                                <dt>Affected Record ID</dt>
                                <dd>{entry.entity_id}</dd>
                              </div>
                            )}

                            {entry.target_user_id && (
                              <div>
                                <dt>Affected User ID</dt>
                                <dd>{entry.target_user_id}</dd>
                              </div>
                            )}

                            {Object.entries(entry.details || {}).map(([key, value]) => (
                              <div key={key}>
                                <dt>{getDetailLabel(key)}</dt>
                                <dd>{getDetailValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={pageSize}
              itemLabel={total === 1 ? "audit event" : "audit events"}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </section>
    </div>
  );
}

export default AdminGlobalAuditLogPage;
