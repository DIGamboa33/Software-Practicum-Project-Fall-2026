import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchPatientDashboard, updateReferralAppointment, schedulePatientAppointment } from "../lib/api";

function PatientHealthInsightsPage() {
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("updates");
  const [updateFilter, setUpdateFilter] = useState("All");
  const [updatePage, setUpdatePage] = useState(1);
  const [updatesPerPage, setUpdatesPerPage] = useState(5);
  const [referralPage, setReferralPage] = useState(1);
  const [referralsPerPage, setReferralsPerPage] = useState(5);

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

  async function handleScheduleReferral(e) {
    e.preventDefault();
    if (!selectedReferral) return;

    try {
      setIsSubmitting(true);
      // 1. Create the appointment first
      const newApt = await schedulePatientAppointment({
        reason: `Specialist Visit: ${selectedReferral.specialty} - ${selectedReferral.reason}`,
        appointment_date: appointmentDate,
        location,
      });

      // 2. Link the referral to this appointment and update status to Approved
      await updateReferralAppointment(selectedReferral.id, newApt.id);

      setSelectedReferral(null);
      setReason("");
      setAppointmentDate("");
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to schedule referral appointment.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
  const updateCategoryData = Object.entries(updates.reduce((counts, update) => {
    const category = update.update_type || "General";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {})).map(([name, count]) => ({ name, updates: count }));
  const visibleUpdates = filteredUpdates.slice((updatePage - 1) * updatesPerPage, updatePage * updatesPerPage);
  const visibleReferrals = referrals.slice((referralPage - 1) * referralsPerPage, referralPage * referralsPerPage);

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Clinical Data</p>
          <h1><Icon name="chart" size={25} /> Health Insights & Records</h1>
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

      <section className="panel patient-chart-card">
        <div className="panel__header"><div><p className="section-label">Clinical activity</p><h2>Updates by category</h2></div><Icon name="chart" size={19} /></div>
        {updateCategoryData.length ? (
          <div className="patient-chart-canvas patient-chart-canvas--bar"><ResponsiveContainer height="100%" width="100%"><BarChart data={updateCategoryData} margin={{ left: -18, right: 8, top: 8 }}><CartesianGrid stroke="#edf0f5" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [`${value} updates`, "Count"]} /><Bar dataKey="updates" fill="#a175d8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        ) : <p className="directory-loading">Clinical update trends will appear when records are added.</p>}
      </section>

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
                  onClick={() => { setUpdateFilter(cat); setUpdatePage(1); }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="updates-list patient-scroll-list" style={{ marginTop: "20px" }}>
            {filteredUpdates.length === 0 ? (
              <p className="empty-list-message" style={{ padding: "20px", textAlign: "center" }}>
                No updates found for this category.
              </p>
            ) : (
              visibleUpdates.map((update) => (
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
          <Pagination currentPage={updatePage} itemLabel="clinical updates" onPageChange={setUpdatePage} onPageSizeChange={(size) => { setUpdatesPerPage(size); setUpdatePage(1); }} pageSize={updatesPerPage} totalItems={filteredUpdates.length} />
        </section>
      )}

      {/* Tab 2: Referrals with Appointment Connections */}
      {activeTab === "referrals" && (
        <section className="panel">
          <div className="panel__header">
            <h2>Specialist Referrals</h2>
            <span className="directory-live-indicator">● Care Coordination</span>
          </div>

          <div className="schedule-list patient-scroll-list" style={{ marginTop: "20px" }}>
            {referrals.length === 0 ? (
              <p className="empty-list-message" style={{ padding: "20px", textAlign: "center" }}>
                No referrals on file.
              </p>
            ) : (
              visibleReferrals.map((ref) => (
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
                  <div>
                    {ref.status === "Pending" ? (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          setSelectedReferral(ref);
                          setReason(`Consultation: ${ref.specialty}`);
                        }}
                      >
                        Schedule Visit ↗
                      </button>
                    ) : (
                      <span style={{ fontSize: "11px", color: "#48546f", fontWeight: "700" }}>
                        {ref.linked_appointment_id ? "Appointment Linked ✓" : "In Progress"}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination currentPage={referralPage} itemLabel="specialist referrals" onPageChange={setReferralPage} onPageSizeChange={(size) => { setReferralsPerPage(size); setReferralPage(1); }} pageSize={referralsPerPage} totalItems={referrals.length} />
        </section>
      )}

      {/* Tab 3: Medical Records (History, Medications, Allergies) */}
      {activeTab === "records" && (
        <div style={{ display: "grid", gap: "20px" }}>
          {/* Medical History */}
          <section className="panel">
            <div className="panel__header">
              <h2><Icon name="grid" size={17} /> Diagnoses & Medical History</h2>
            </div>
            <div className="classroom-health-list patient-scroll-list" style={{ marginTop: "16px" }}>
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
              <h2><Icon name="settings" size={17} /> Active Medications</h2>
            </div>
            <div className="medication-list patient-scroll-list">
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
              <h2><Icon name="bell" size={17} /> Allergies & Adverse Reactions</h2>
            </div>
            <div className="classroom-health-list patient-scroll-list" style={{ marginTop: "16px" }}>
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

      {/* Schedule Modal for Pending Referrals */}
      {selectedReferral && (
        <div className="sidebar-backdrop" style={{ display: "grid", placeItems: "center", zIndex: 10 }}>
          <section className="panel" style={{ width: "min(90%, 460px)", padding: "28px" }}>
            <div className="panel__header">
              <h2>Schedule Referral Visit</h2>
              <button className="more-button" type="button" onClick={() => setSelectedReferral(null)}>✕</button>
            </div>
            <p className="muted-copy" style={{ marginTop: "8px" }}>
              Booking specialist appointment for <strong>{selectedReferral.specialty}</strong>.
            </p>
            <form onSubmit={handleScheduleReferral} className="scenario-form" style={{ marginTop: "16px" }}>
              <label>
                Reason for Visit
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                Date & Time
                <input
                  type="datetime-local"
                  required
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                />
              </label>
              <label>
                Clinic Location / Room
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <div className="form-actions" style={{ marginTop: "16px" }}>
                <button className="secondary-button" type="button" onClick={() => setSelectedReferral(null)}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Booking..." : "Confirm & Link Referral"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default PatientHealthInsightsPage;
