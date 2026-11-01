import { useEffect, useState } from "react";
import { fetchPatientDashboard} from "../lib/api";

function PatientHealthInsightsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("updates");
  const [updateFilter, setUpdateFilter] = useState("All");

  // Modal state for scheduling from a referral
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [reason, setReason] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [location, setLocation] = useState("Specialty Clinic Room B");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const data = await fetchPatientDashboard();
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load health insights.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  

  if (isLoading) {
    return (
      <div className="dashboard-page content-page">
        <p className="directory-loading">Loading health insights…</p>
      </div>
    );
  }

  const updates = dashboard?.clinicalUpdates || [];
  const referrals = dashboard?.referrals || [];
  const history = dashboard?.medicalHistory || [];
  const medications = dashboard?.medications || [];
  const allergies = dashboard?.allergies || [];

const filteredUpdates = updates.filter(u => {
    if (updateFilter === "All") return true;
    
    const type = (u.update_type || "").toLowerCase();
    if (updateFilter === "Lab Result") {
      return type.includes("lab") || type.includes("test") || type.includes("result");
    }
    if (updateFilter === "General") {
      return !type.includes("lab") && !type.includes("test") && !type.includes("result");
    }
    return type.includes(updateFilter.toLowerCase());
  });

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Clinical Data</p>
          <h1>Health Insights & Records</h1>
          <p>Review lab updates, specialist referrals, medications, and medical history.</p>
        </div>
      </section>

      {error && <section className="panel directory-error" style={{ marginTop: "20px" }}>{error}</section>}

      {/* Tabs Bar */}
      <div className="case-tabs-bar" style={{ marginTop: "24px" }}>
        <div className="case-tabs">
          <button
            type="button"
            className={`case-tab ${activeTab === "updates" ? "case-tab--active" : ""}`}
            onClick={() => setActiveTab("updates")}
          >
            Clinical & Lab Updates ({updates.length})
          </button>
          <button
            type="button"
            className={`case-tab ${activeTab === "referrals" ? "case-tab--active" : ""}`}
            onClick={() => setActiveTab("referrals")}
          >
            Specialist Referrals ({referrals.length})
          </button>
          <button
            type="button"
            className={`case-tab ${activeTab === "records" ? "case-tab--active" : ""}`}
            onClick={() => setActiveTab("records")}
          >
            Medical Records & Allergies
          </button>
        </div>
      </div>

      {/* Tab 1: Clinical Updates with Category Filters */}
      {activeTab === "updates" && (
        <section className="panel">
          <div className="panel__header">
            <h2>Clinical & Lab Updates</h2>
            <div className="roster-controls__tabs">
              {["All", "Lab Result", "General"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`roster-view-button ${updateFilter === cat ? "roster-view-button--active" : ""}`}
                  onClick={() => setUpdateFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="updates-list" style={{ marginTop: "20px" }}>
            {filteredUpdates.length === 0 ? (
              <p className="empty-list-message" style={{ padding: "20px", textAlign: "center" }}>
                No updates found for this category.
              </p>
            ) : (
              filteredUpdates.map((update) => (
                <div className="update" key={update.id}>
                  <span className="update__dot" style={{ background: update.is_read ? "#d4d9e2" : "#7de4cf" }} />
                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <h3>{update.title}</h3>
                      {update.update_type && <span className="preview-label">{update.update_type}</span>}
                    </div>
                    <p>{update.content}</p>
                  </div>
                  <time>{new Date(update.created_at).toLocaleDateString()}</time>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Tab 2: Referrals with Appointment Connections */}
      {activeTab === "referrals" && (
        <section className="panel">
          <div className="panel__header">
            <h2>Specialist Referrals</h2>
            <span className="directory-live-indicator">● Care Coordination</span>
          </div>

          <div className="schedule-list" style={{ marginTop: "20px" }}>
            {referrals.length === 0 ? (
              <p className="empty-list-message" style={{ padding: "20px", textAlign: "center" }}>
                No referrals on file.
              </p>
            ) : (
              referrals.map((ref) => (
                <div className="appointment" key={ref.id} style={{ gridTemplateColumns: "1fr auto auto", alignItems: "center" }}>
                  <div>
                    <h3>{ref.specialty}</h3>
                    <p>{ref.reason}</p>
                    <small style={{ color: "#8a94a8" }}>Notes: {ref.notes || "None"}</small>
                  </div>
                  <div>
                    <span className={`status-badge status-badge--${ref.status.toLowerCase()}`}>
                      {ref.status}
                    </span>
                  </div>
                 
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Tab 3: Medical Records (History, Medications, Allergies) */}
      {activeTab === "records" && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Medical History */}
          <section className="panel">
            <div className="panel__header">
              <h2>Diagnoses & Medical History</h2>
            </div>
            <div className="classroom-health-list" style={{ marginTop: "16px" }}>
              {history.map((item) => (
                <article key={item.id} style={{ paddingTop: "12px" }}>
                  <div className="classroom-health-list__heading">
                    <div>
                      <h3>{item.condition_name}</h3>
                      <p>{item.notes}</p>
                    </div>
                    <span>{item.status}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Medications */}
          <section className="panel">
            <div className="panel__header">
              <h2>Active Medications</h2>
            </div>
            <div className="medication-list">
              {medications.map((med) => (
                <div className="medication" key={med.id}>
                  <span className="medication__pill medication__pill--purple">MED</span>
                  <div>
                    <h3>{med.medication_name}</h3>
                    <p>{med.dosage} · {med.frequency}</p>
                  </div>
                  <span>{med.status}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Allergies */}
          <section className="panel">
            <div className="panel__header">
              <h2>Allergies & Adverse Reactions</h2>
            </div>
            <div className="classroom-health-list" style={{ marginTop: "16px" }}>
              {allergies.length === 0 ? (
                <p className="empty-list-message">No known allergies logged.</p>
              ) : (
                allergies.map((allergy) => (
                  <article key={allergy.id} style={{ paddingTop: "12px" }}>
                    <div className="classroom-health-list__heading">
                      <div>
                        <h3>{allergy.allergen}</h3>
                        <p>Reaction: {allergy.reaction} — {allergy.notes}</p>
                      </div>
                      <span style={{ color: allergy.severity === "Severe" ? "#b91c1c" : "#987025" }}>
                        {allergy.severity}
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      
    </div>
  );
}

export default PatientHealthInsightsPage;