import { useEffect, useState } from "react";
import ReviewDecisionPanel from "../components/ReviewDecisionPanel";

const STATUS_OPTIONS = [
  "All",
  "Pending Review",
  "Approved",
  "Returned",
];

const TEMPLATE_NAMES = {
  pharmacy_soap: "Pharmacy SOAP Note",
  pharmacy_sbar: "Pharmacy SBAR Note",
  pharmacy_mtm: "Pharmacy MTM Note",
};

function getAccessToken() {
  return sessionStorage.getItem("careflow-access-token");
}

async function instructorRequest(path) {
  const token = getAccessToken();

  if (!token) {
    throw new Error("Please sign in again.");
  }

  const response = await fetch(`/api/instructor${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message || "Unable to load instructor reviews."
    );
  }

  return result;
}

function formatDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString();
}

function formatStudent(student) {
  if (!student) return "Unknown student";

  if (student.name) return student.name;

  return (
    [student.first_name, student.last_name]
      .filter(Boolean)
      .join(" ") || "Unknown student"
  );
}

function formatLabel(value) {
  return String(value)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTemplateName(note) {
  const type =
    note?.note_type ||
    note?.noteType ||
    note?.type ||
    note?.content?.type ||
    "soap";

  return TEMPLATE_NAMES[type] || `${formatLabel(type)} Note`;
}

function DisplayValue({ value }) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return (
      <span
        style={{
          color: "#94a3b8",
          fontSize: "14px",
        }}
      >
        Not provided
      </span>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span
          style={{
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          None recorded
        </span>
      );
    }

    return (
      <ul
        style={{
          margin: "6px 0",
          paddingLeft: "20px",
          color: "#334155",
        }}
      >
        {value.map((item, index) => (
          <li
            key={index}
            style={{ marginBottom: "6px" }}
          >
            <DisplayValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).filter(
      ([key]) =>
        key !== "medication_id" &&
        key !== "id"
    );

    if (entries.length === 0) {
      return (
        <span style={{ color: "#94a3b8" }}>
          No information recorded
        </span>
      );
    }

    return (
      <div
        style={{
          display: "grid",
          gap: "12px",
          marginTop: "8px",
        }}
      >
        {entries.map(([key, item]) => (
          <div
            key={key}
            style={{
              padding: "12px 16px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
            }}
          >
            <strong
              style={{
                display: "block",
                marginBottom: "5px",
                fontSize: "13px",
                fontWeight: 600,
                color: "#475569",
              }}
            >
              {formatLabel(key)}
            </strong>

            <DisplayValue value={item} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <p
      style={{
        margin: 0,
        fontSize: "14px",
        lineHeight: 1.7,
        color: "#334155",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
      }}
    >
      {String(value)}
    </p>
  );
}

function NoteDetails({ note }) {
  if (!note) {
    return (
      <p>No note available for this submission.</p>
    );
  }

  const rawContent =
    note.content &&
    typeof note.content === "object"
      ? note.content
      : {};

  const noteTitle =
    note.title ||
    rawContent.title ||
    "Untitled Note";

  const templateName = getTemplateName(note);

  // Pharmacy templates store their form fields
  // inside content.content.
  const mainContent =
    rawContent.content &&
    typeof rawContent.content === "object" &&
    !Array.isArray(rawContent.content)
      ? rawContent.content
      : rawContent;

  const excludedFields = [
    "title",
    "type",
    "instructorId",
    "instructorName",
    "submittedAt",
    "createdAt",
    "updatedAt",
  ];

  const contentSections =
    mainContent &&
    typeof mainContent === "object" &&
    !Array.isArray(mainContent)
      ? Object.entries(mainContent).filter(
          ([key]) => !excludedFields.includes(key)
        )
      : [];

  // These are saved separately from the main
  // template content in Pharmacy notes.
  const additionalSections = [];

  if (
    mainContent !== rawContent &&
    rawContent.vitals &&
    Object.keys(rawContent.vitals).length > 0
  ) {
    additionalSections.push([
      "Vitals",
      rawContent.vitals,
    ]);
  }

  if (
    mainContent !== rawContent &&
    Array.isArray(rawContent.problems) &&
    rawContent.problems.length > 0
  ) {
    additionalSections.push([
      "Problems",
      rawContent.problems,
    ]);
  }

  if (
    mainContent !== rawContent &&
    Array.isArray(rawContent.medications) &&
    rawContent.medications.length > 0
  ) {
    additionalSections.push([
      "Medications",
      rawContent.medications,
    ]);
  }

  const allSections = [
    ...contentSections,
    ...additionalSections,
  ];

  return (
    <article style={{ marginTop: "24px" }}>
      <div
        style={{
          padding: "20px",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          background: "#f8fafc",
          marginBottom: "20px",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "12px",
            fontWeight: 700,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {templateName}
        </p>

        <h2
          style={{
            margin: "0 0 12px",
            color: "#0f172a",
          }}
        >
          {noteTitle}
        </h2>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            color: "#64748b",
            fontSize: "13px",
          }}
        >
          <span>
            <strong>Status:</strong>{" "}
            {note.status || "Unknown"}
          </span>

          <span>
            <strong>Last Updated:</strong>{" "}
            {formatDate(note.updated_at || note.updatedAt)}
          </span>
        </div>
      </div>

      {allSections.length === 0 ? (
        <p>No note content available.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: "16px",
          }}
        >
          {allSections.map(([section, value]) => (
            <div
              key={section}
              style={{
                padding: "20px",
                border: "1px solid #e2e8f0",
                borderRadius: "12px",
                background: "#fff",
              }}
            >
              <h3
                style={{
                  margin: "0 0 14px",
                  color: "#0f172a",
                  fontSize: "16px",
                  fontWeight: 650,
                }}
              >
                {formatLabel(section)}
              </h3>

              <DisplayValue value={value} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function InstructorReviewPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const [selectedAssignmentId, setSelectedAssignmentId] =
    useState(null);

  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] =
    useState(false);
  const [detailsError, setDetailsError] = useState("");

  async function loadSubmissions() {
    setLoading(true);
    setError("");

    try {
      const result = await instructorRequest(
        "/submissions"
      );

      setSubmissions(result.submissions || []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load submissions."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const result = await instructorRequest(
          "/submissions"
        );

        if (active) {
          setSubmissions(result.submissions || []);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load submissions."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  async function refreshAfterReview() {
    await loadSubmissions();

    if (!details?.assignmentId) return;

    try {
      const result = await instructorRequest(
        `/submissions/${details.assignmentId}`
      );

      setDetails(result);
      setDetailsError("");
    } catch (refreshError) {
      setDetailsError(
        refreshError.message ||
          "Unable to refresh this submission."
      );
    }
  }

  async function openSubmission(assignmentId) {
    if (selectedAssignmentId === assignmentId) {
      setSelectedAssignmentId(null);
      setDetails(null);
      setDetailsError("");
      return;
    }

    setSelectedAssignmentId(assignmentId);
    setDetails(null);
    setDetailsError("");
    setDetailsLoading(true);

    try {
      const result = await instructorRequest(
        `/submissions/${assignmentId}`
      );

      setDetails(result);
    } catch (loadError) {
      setDetailsError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to open submission."
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  const pendingCount = submissions.filter(
    (item) => item.status === "Pending Review"
  ).length;

  const approvedCount = submissions.filter(
    (item) => item.status === "Approved"
  ).length;

  const returnedCount = submissions.filter(
    (item) => item.status === "Returned"
  ).length;

  const visibleSubmissions = submissions.filter(
    (item) => {
      if (
        filter !== "All" &&
        item.status !== filter
      ) {
        return false;
      }

      const searchableText = [
        formatStudent(item.student),
        item.patientCase?.title,
        item.patientCase?.patient_name,
        item.noteTitle,
        item.noteType,
        item.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(
        search.toLowerCase().trim()
      );
    }
  );

  const styles = {
    toolbar: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "12px",
      marginBottom: "24px",
    },

    input: {
      flex: "1 1 240px",
      minWidth: 0,
      padding: "12px 14px",
      border: "1px solid #dbe2ea",
      borderRadius: "10px",
      background: "#fff",
      color: "#334155",
      font: "inherit",
      fontSize: "14px",
    },

    select: {
      minWidth: "170px",
      padding: "12px 14px",
      border: "1px solid #dbe2ea",
      borderRadius: "10px",
      background: "#fff",
      color: "#334155",
      font: "inherit",
      fontSize: "14px",
    },

    list: {
      display: "grid",
      gap: "14px",
    },

    card: {
      padding: "20px",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      background: "#fff",
    },

    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      flexWrap: "wrap",
      gap: "16px",
    },

    cardFooter: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "16px",
      marginTop: "18px",
      paddingTop: "14px",
      borderTop: "1px solid #e2e8f0",
    },

    metadata: {
      display: "flex",
      flexWrap: "wrap",
      gap: "16px",
      color: "#64748b",
      fontSize: "13px",
    },

    button: {
      padding: "9px 15px",
      border: "1px solid #cbd5e1",
      borderRadius: "9px",
      background: "#fff",
      color: "#334155",
      font: "inherit",
      fontSize: "13px",
      fontWeight: 600,
      cursor: "pointer",
    },

    status: {
      display: "inline-flex",
      alignItems: "center",
      padding: "6px 11px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 650,
      whiteSpace: "nowrap",
    },
  };

  function statusStyle(status) {
    if (status === "Pending Review") {
      return {
        background: "#eef2ff",
        color: "#4338ca",
      };
    }

    if (status === "Approved") {
      return {
        background: "#dcfce7",
        color: "#166534",
      };
    }

    if (status === "Returned") {
      return {
        background: "#fef3c7",
        color: "#92400e",
      };
    }

    return {
      background: "#f1f5f9",
      color: "#475569",
    };
  }

  return (
    <div className="dashboard-page content-page instructor-workspace">
      <section className="page-heading">
        <div>
          <p className="section-label">
            Instructor workspace · documentation
          </p>

          <h1>Review &amp; Cosign</h1>

          <p>
            View submitted student documentation
            awaiting instructor review.
          </p>
        </div>
      </section>

      {/* Overview metrics */}
      <section className="instructor-overview-metrics">
        {[
          {
            label: "Pending Review",
            value: pendingCount,
            tone: "indigo",
          },
          {
            label: "Approved",
            value: approvedCount,
            tone: "teal",
          },
          {
            label: "Returned",
            value: returnedCount,
            tone: "amber",
          },
        ].map((metric) => (
          <article
            key={metric.label}
            className={`panel instructor-overview-metric instructor-overview-metric--${metric.tone}`}
          >
            <span>{metric.label}</span>

            <strong>
              {loading || error ? "—" : metric.value}
            </strong>

            <small>Student documentation</small>
          </article>
        ))}
      </section>

      {/* Submission queue */}
      <section className="panel review-queue-panel">
        <div
          className="panel__header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div>
            <p className="section-label">
              Documentation queue
            </p>

            <h2>Student Submissions</h2>

            <p
              style={{
                marginTop: "6px",
                color: "#64748b",
                fontSize: "14px",
              }}
            >
              Review submitted student notes,
              including SOAP, SBAR, and MTM documentation.
            </p>
          </div>

          <button
            type="button"
            style={styles.button}
            onClick={loadSubmissions}
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {/* Search and filters */}
        <div style={styles.toolbar}>
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search student, patient, or note..."
            aria-label="Search submissions"
            style={styles.input}
          />

          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value)
            }
            aria-label="Filter by status"
            style={styles.select}
          >
            {STATUS_OPTIONS.map((status) => (
              <option
                key={status}
                value={status}
              >
                {status}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="directory-error">
            {error}
          </p>
        )}

        {loading && (
          <p className="directory-loading">
            Loading student submissions…
          </p>
        )}

        {!loading &&
          !error &&
          visibleSubmissions.length === 0 && (
            <p className="directory-loading">
              No submissions match your current filters.
            </p>
          )}

        {!loading &&
          !error &&
          visibleSubmissions.length > 0 && (
            <div style={styles.list}>
              {visibleSubmissions.map(
                (submission) => (
                  <article
                    key={submission.id}
                    style={styles.card}
                  >
                    <div style={styles.cardHeader}>
                      <div>
                        <h3
                          style={{
                            margin: "0 0 6px",
                            fontSize: "17px",
                            fontWeight: 650,
                            color: "#0f172a",
                          }}
                        >
                          {formatStudent(
                            submission.student
                          )}
                        </h3>

                        <p
                          style={{
                            margin: "0 0 5px",
                            color: "#334155",
                          }}
                        >
                          {submission.patientCase?.title ||
                            "Untitled case"}
                        </p>

                        <small
                          style={{
                            color: "#64748b",
                          }}
                        >
                          Patient:{" "}
                          {submission.patientCase
                            ?.patient_name ||
                            "Unknown patient"}
                        </small>
                      </div>

                      <span
                        style={{
                          ...styles.status,
                          ...statusStyle(
                            submission.status
                          ),
                        }}
                      >
                        {submission.status}
                      </span>
                    </div>

                    <div style={styles.cardFooter}>
                      <div style={styles.metadata}>
                        <span>
                          {getTemplateName({
                            note_type:
                              submission.noteType,
                          })}
                        </span>

                        <span>
                          {formatDate(
                            submission.updatedAt
                          )}
                        </span>
                      </div>

                      <button
                        type="button"
                        style={styles.button}
                        onClick={() =>
                          openSubmission(
                            submission.assignmentId
                          )
                        }
                      >
                        {selectedAssignmentId ===
                        submission.assignmentId
                          ? "Close Details"
                          : "View Submission"}
                      </button>
                    </div>
                  </article>
                )
              )}
            </div>
          )}
      </section>

      {/* Expanded submission details */}
      {selectedAssignmentId !== null && (
        <section className="panel review-queue-panel">
          <div className="panel__header">
            <div>
              <p className="section-label">
                Student documentation
              </p>

              <h2>Submission Details</h2>
            </div>

            <button
              type="button"
              style={styles.button}
              onClick={() => {
                setSelectedAssignmentId(null);
                setDetails(null);
                setDetailsError("");
              }}
            >
              Close
            </button>
          </div>

          {detailsLoading && (
            <p className="directory-loading">
              Loading documentation…
            </p>
          )}

          {detailsError && (
            <p className="directory-error">
              {detailsError}
            </p>
          )}

          {!detailsLoading && details && (
            <>
              {/* Student */}
              <div className="scope-rule">
                <strong>Student</strong>

                <span>
                  {formatStudent(
                    details.student
                  )}
                </span>
              </div>

              {/* Patient */}
              <div className="scope-rule">
                <strong>Patient</strong>

                <span>
                  {details.patientCase
                    ?.patient_name ||
                    "Unknown patient"}
                </span>
              </div>

              {/* Case */}
              <div className="scope-rule">
                <strong>Case</strong>

                <span>
                  {details.patientCase?.title ||
                    "Untitled case"}
                </span>
              </div>

              {/* Note status */}
              <div className="scope-rule">
                <strong>Status</strong>

                <span>
                  {details.note?.status ||
                    "Unknown"}
                </span>
              </div>

              {/* Dynamic note template */}
              <NoteDetails note={details.note} />

              {/* Instructor review actions */}
              <div style={{ marginTop: "28px" }}>
                <ReviewDecisionPanel
                  assignmentId={
                    details.assignmentId
                  }
                  status={
                    details.note?.status
                  }
                  onReviewed={
                    refreshAfterReview
                  }
                />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default InstructorReviewPage;