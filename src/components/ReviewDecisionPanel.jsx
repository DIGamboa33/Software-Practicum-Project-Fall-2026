import { useState } from "react";

// saves the instructor's decision and rubric scores. Calls the review route
// directly, because the review page's own request helper only sends GET requests.
async function submitReview(assignmentId, decision, comments, scores) {
  const accessToken = sessionStorage.getItem("careflow-access-token");
  if (!accessToken) {
    throw new Error("No active session. Please sign in again.");
  }

  const response = await fetch(
    `/api/instructor/submissions/${encodeURIComponent(assignmentId)}/review`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ decision, comments, scores }),
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Unable to save your review.");
  }
  return payload;
}

function ReviewDecisionPanel({ assignmentId, status, criteria = [], onReviewed }) {
  const [comments, setComments] = useState("");
  // { [criterionId]: { points: "3", feedback: "..." } }
  const [scores, setScores] = useState({});
  // Turns on the red "needs points" warnings after a failed Approve click
  const [triedApprove, setTriedApprove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Only a submitted note can be reviewed
  if (status !== "Pending Review" && !message) return null;

  const canReview = status === "Pending Review";

  const maxTotal = criteria.reduce((sum, c) => sum + Number(c.max_points), 0);
  const total = criteria.reduce(
    (sum, c) => sum + (Number(scores[c.id]?.points) || 0),
    0,
  );

  function updateScore(criterionId, field, value) {
    setScores((previous) => ({
      ...previous,
      [criterionId]: { ...previous[criterionId], [field]: value },
    }));
  }

  // Only digits with one optional decimal, and never above the criterion's max.
  function updatePoints(criterion, raw) {
    if (raw !== "" && !/^\d{0,4}(\.\d?)?$/.test(raw)) return;

    const max = Number(criterion.max_points);
    const value = raw !== "" && Number(raw) > max ? String(max) : raw;
    updateScore(criterion.id, "points", value);
  }

  function isEmpty(criterion) {
    const points = scores[criterion.id]?.points;
    return points === undefined || points === "";
  }

  async function decide(decision) {
    if (decision === "Returned" && !comments.trim()) {
      setError("Add feedback explaining what the student should revise.");
      return;
    }

    const scored = criteria.filter((c) => !isEmpty(c));

    if (decision === "Approved" && scored.length < criteria.length) {
      setTriedApprove(true);
      setError("Enter points for every rubric criterion before approving (0 counts).");
      return;
    }

    // Catches a lone "." that the typing filter lets through
    for (const criterion of scored) {
      if (!Number.isFinite(Number(scores[criterion.id].points))) {
        setError(`"${criterion.description}" needs a valid number.`);
        return;
      }
    }
 
    const payloadScores = scored.map((criterion) => ({
      criterionId: criterion.id,
      points: Number(scores[criterion.id].points),
      feedback: scores[criterion.id].feedback || "",
    }));

    try {
      setSaving(true);
      setError("");
      const result = await submitReview(assignmentId, decision, comments, payloadScores);
      setMessage(result.message);
      setComments("");
      setScores({});
      if (onReviewed) onReviewed(result.note);
    } catch (reviewError) {
      setError(reviewError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel data-panel review-decision">
      <p className="section-label">Review decision</p>
      <h2>Feedback for the student</h2>

      {canReview && criteria.length > 0 && (
        <div style={{ display: "grid", gap: "12px", margin: "16px 0" }}>
          <h3 style={{ margin: 0, fontSize: "16px" }}>Rubric</h3>

                    {criteria.map((criterion) => {
            const missing = triedApprove && isEmpty(criterion);

            return (
              <div
                key={criterion.id}
                style={{
                  padding: "12px 14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <label htmlFor={`score-${criterion.id}`}>{criterion.description}</label>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="review-field" style={{ width: "90px" }}>
                      <textarea
                        id={`score-${criterion.id}`}
                        rows={1}
                        inputMode="decimal"
                        value={scores[criterion.id]?.points ?? ""}
                        onChange={(event) => updatePoints(criterion, event.target.value)}
                        aria-invalid={missing}
                        style={{ resize: "none", minHeight: 0, height: "44px", overflow: "hidden" }}
                      />
                    </div>
                    <span style={{ whiteSpace: "nowrap" }}>/ {criterion.max_points}</span>
                  </div>
                </div>

                <div className="review-field" style={{ marginTop: "8px" }}>
                  <textarea
                    rows={1}
                    maxLength={500}
                    placeholder="Optional feedback for this criterion"
                    value={scores[criterion.id]?.feedback ?? ""}
                    onChange={(event) =>
                      updateScore(criterion.id, "feedback", event.target.value.replace(/\n/g, " "))
                    }
                    style={{ resize: "none",minHeight: 0, height: "44px", overflow: "hidden" }}
                  />
                </div>

                {missing && (
                  <p className="directory-error" role="alert" style={{ margin: "8px 0 0" }}>
                    Enter points from 0 to {criterion.max_points} (0 counts).
                  </p>
                )}
              </div>
            );
          })}

          <strong>
            Total: {total} / {maxTotal}
          </strong>
        </div>
      )}

      {canReview && (
        <div className="review-field block">
          <label htmlFor="review-comments">
            Comments <span className="review-field__hint">(required when returning)</span>
          </label>
          <textarea
            id="review-comments"
            maxLength={2000}
            onChange={(event) => setComments(event.target.value)}
            placeholder="Explain what the student did well and what to revise."
            rows={5}
            value={comments}
          />
          <span className="review-field__count">{comments.length} / 2000</span>
        </div>
      )}

      {error && (
        <p className="directory-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}

      {canReview && (
        <div className="form-actions review-decision__actions">
          <button
            className="secondary-button"
            disabled={saving}
            onClick={() => decide("Returned")}
            type="button"
          >
            Return for revision
          </button>
          <button
            className="primary-button"
            disabled={saving}
            onClick={() => decide("Approved")}
            type="button"
          >
            Approve
          </button>
        </div>
      )}
    </section>
  );
}
export default ReviewDecisionPanel;