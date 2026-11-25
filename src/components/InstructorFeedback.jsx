function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

// Due dates are saved with a time, so show it in the student's local time.
function formatDueDate(value) {
  if (!value) return "No due date";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No due date"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

const STATUS_LABELS = {
  Approved: "Approved",
  Returned: "Returned for revision",
  "Pending Review": "Submitted, awaiting review",
  Draft: "In progress",
};

function InstructorFeedback({ grading }) {
  if (!grading || grading.rubric.length === 0) return null;

  const { review, rubric } = grading;
  const graded = Boolean(review) && grading.scoredCount === rubric.length;

  const statusLabel = STATUS_LABELS[grading.noteStatus] || "Not started";

  // Late unless the work is approved or already waiting for review.
  const pastDue =
    Boolean(grading.dueAt) &&
    new Date(grading.dueAt) < new Date() &&
    !["Approved", "Pending Review"].includes(grading.noteStatus);

  const tile = {
    padding: "12px 14px",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    background: "#f8fafc",
  };

  const tileLabel = { margin: 0, fontSize: "12px", color: "#64748b", fontWeight: 600 };
  const tileValue = { margin: "4px 0 0", fontSize: "18px", fontWeight: 700 };

  // Light blue card. For faint yellow, use background "#fffbeb" and border "#fde68a".
  const rubricCard = { background: "#eff6ff", border: "#bfdbfe" };

  return (
    <section aria-label="Grade and feedback" className="panel data-panel">
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{statusLabel}</h2>

        {pastDue && (
          <span
            style={{
              padding: "4px 12px",
              borderRadius: "999px",
              background: "#fee2e2",
              color: "#b91c1c",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            Past due
          </span>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "10px",
          margin: "12px 0 16px",
        }}
      >
        <div style={tile}>
          <p style={tileLabel}>Maximum points</p>
          <p style={tileValue}>{grading.totalMax}</p>
        </div>

        <div style={tile}>
          <p style={tileLabel}>Grade</p>
          <p style={tileValue}>
            {graded ? `${grading.totalPoints} / ${grading.totalMax}` : "Not graded yet"}
          </p>
        </div>

        <div style={tile}>
          <p style={tileLabel}>Attempts</p>
          <p style={tileValue}>{grading.attempts}</p>
        </div>

        <div style={tile}>
          <p style={tileLabel}>Due</p>
          <p style={{ ...tileValue, fontSize: "16px" }}>{formatDueDate(grading.dueAt)}</p>
        </div>
      </div>

      {review && (
        <p className="feedback-date">Reviewed {formatDate(review.created_at)}</p>
      )}

      {review?.comments && (
        <p className="feedback-comments" style={{ overflowWrap: "anywhere" }}>
          {review.comments}
        </p>
      )}

      <div
        style={{
          marginTop: "16px",
          padding: "16px",
          border: `1px solid ${rubricCard.border}`,
          borderRadius: "12px",
          background: rubricCard.background,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "16px" }}>Rubric</h3>
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            {grading.totalMax} points
          </span>
        </div>

        <div style={{ display: "grid", gap: "10px" }}>
          {rubric.map((item) => (
            <div
              key={item.id}
              style={{
                padding: "10px 14px",
                border: `1px solid ${rubricCard.border}`,
                borderRadius: "10px",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span>{item.description}</span>
                <strong style={{ whiteSpace: "nowrap" }}>
                  {item.points === null ? "–" : item.points} / {item.maxPoints}
                </strong>
              </div>

              {item.feedback && (
                <div
                  style={{
                    marginTop: "10px",
                    padding: "8px 12px",
                    borderLeft: "3px solid #7de4cf",
                    borderRadius: "6px",
                    background: "#f0fdfa",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#0f766e",
                    }}
                  >
                    Instructor comment
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "#334155",
                      fontSize: "14px",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.feedback}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default InstructorFeedback;

