import { useEffect, useState } from "react";
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchPatientDashboard } from "../lib/api";

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

  const [selectedUpdate, setSelectedUpdate] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

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

  const updateCategoryData = Object.entries(updates.reduce((counts, update) => {
    const category = update.update_type || "General";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {})).map(([name, count]) => ({ name, updates: count }));

  const updatesOverTime = Object.entries(updates.reduce((counts, update) => {
    const date = new Date(update.created_at);
    if (Number.isNaN(date.getTime())) return counts;
    const key = date.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {}))
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .slice(-8)
    .map(([date, count]) => ({
      date: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      updates: count,
    }));

  const referralStatusData = Object.entries(referrals.reduce((counts, referral) => {
    const status = referral.status || "Unspecified";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {})).map(([name, count]) => ({ name, referrals: count }));

  const visibleUpdates = filteredUpdates.slice((updatePage - 1) * updatesPerPage, updatePage * updatesPerPage);
  const visibleReferrals = referrals.slice((referralPage - 1) * referralsPerPage, referralPage * referralsPerPage);

  function handleOpenUpdateModal(update) {
    setSelectedUpdate(update);
    setShowUpdateModal(true);
  }

  function handleCloseUpdateModal() {
    setShowUpdateModal(false);
    setSelectedUpdate(null);
  }

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

      <section className="patient-health-insight-charts">
        <article className="panel patient-chart-card">
          <div className="panel__header"><div><p className="section-label">Clinical activity</p><h2>Updates by category</h2></div><Icon name="chart" size={19} /></div>
          {updateCategoryData.length ? (
            <div className="patient-chart-canvas"><ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={updateCategoryData} dataKey="updates" innerRadius={52} nameKey="name" outerRadius={78} paddingAngle={3}>{updateCategoryData.map((item, index) => <Cell fill={["#a175d8", "#6277d8", "#45bca2", "#f0a650"][index % 4]} key={item.name} />)}</Pie><Tooltip formatter={(value) => [`${value} updates`, "Count"]} /><Legend /></PieChart></ResponsiveContainer></div>
          ) : <p className="directory-loading">Clinical categories will appear when records are added.</p>}
        </article>

        <article className="panel patient-chart-card">
          <div className="panel__header"><div><p className="section-label">Clinical activity</p><h2>Update timeline</h2></div><Icon name="calendar" size={19} /></div>
          {updatesOverTime.length ? (
            <div className="patient-chart-canvas"><ResponsiveContainer height="100%" width="100%"><LineChart data={updatesOverTime} margin={{ left: -20, right: 8, top: 12 }}><CartesianGrid stroke="#edf0f5" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [`${value} updates`, "Recorded"]} /><Line dataKey="updates" dot={{ r: 4, fill: "#6277d8" }} stroke="#6277d8" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></div>
          ) : <p className="directory-loading">A timeline will appear once updates have recorded dates.</p>}
        </article>

        <article className="panel patient-chart-card">
          <div className="panel__header"><div><p className="section-label">Care coordination</p><h2>Referral status</h2></div><Icon name="patients" size={19} /></div>
          {referralStatusData.length ? (
            <div className="patient-chart-canvas"><ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={referralStatusData} dataKey="referrals" innerRadius={52} nameKey="name" outerRadius={78} paddingAngle={3}>{referralStatusData.map((item, index) => <Cell fill={["#45bca2", "#f0a650", "#6277d8", "#d87070"][index % 4]} key={item.name} />)}</Pie><Tooltip formatter={(value) => [`${value} referrals`, "Count"]} /><Legend /></PieChart></ResponsiveContainer></div>
          ) : <p className="directory-loading">Referral status will appear when referrals are added.</p>}
        </article>
      </section>

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

          <p style={{ fontSize: "13px", color: "#64748b", marginTop: "12px", padding: "0 4px" }}>
            * Click any update or lab result below to read plain-language breakdowns, normal range indicators, and recommendations.
          </p>

          <div className="updates-list patient-scroll-list" style={{ marginTop: "16px" }}>
            {filteredUpdates.length === 0 ? (
              <p className="empty-list-message" style={{ padding: "20px", textAlign: "center" }}>
                No updates found for this category.
              </p>
            ) : (
              visibleUpdates.map((update) => (
                <div 
                  className="update" 
                  key={update.id} 
                  onClick={() => handleOpenUpdateModal(update)}
                  style={{ cursor: "pointer", transition: "background 0.2s", borderRadius: "8px", padding: "10px" }}
                >
                  <span className="update__dot" style={{ background: update.is_read ? "#d4d9e2" : "#7de4cf" }} />
                  <div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <h3>{update.title}</h3>
                      {update.update_type && <span className="preview-label">{update.update_type}</span>}
                    </div>
                    <p>{update.content}</p>
                    {update.description && (
                      <p style={{ fontSize: "12px", color: "#475569", marginTop: "4px", fontStyle: "italic" }}>
                        <strong>Summary:</strong> {update.description}
                      </p>
                    )}
                  </div>
                  <time>{new Date(update.created_at).toLocaleDateString()}</time>
                </div>
              ))
            )}
          </div>
          <Pagination currentPage={updatePage} itemLabel="clinical updates" onPageChange={setUpdatePage} onPageSizeChange={(size) => { setUpdatesPerPage(size); setUpdatePage(1); }} pageSize={updatesPerPage} totalItems={filteredUpdates.length} />
        </section>
      )}

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
                </div>
              ))
            )}
          </div>
          <Pagination currentPage={referralPage} itemLabel="specialist referrals" onPageChange={setReferralPage} onPageSizeChange={(size) => { setReferralsPerPage(size); setReferralPage(1); }} pageSize={referralsPerPage} totalItems={referrals.length} />
        </section>
      )}

      {activeTab === "records" && (
        <div style={{ display: "grid", gap: "20px" }}>
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

      {showUpdateModal && selectedUpdate && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="modal-content panel" style={{ background: "#fff", maxWidth: "600px", width: "100%", padding: "24px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <span className="section-label">{selectedUpdate.update_type || "Clinical Update"}</span>
                <h2 style={{ margin: "4px 0 0 0" }}>{selectedUpdate.title}</h2>
              </div>
              <button type="button" onClick={handleCloseUpdateModal} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: "16px", fontSize: "14px" }}>
              <div>
                <strong>Recorded Date:</strong> {new Date(selectedUpdate.created_at).toLocaleDateString()}
              </div>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px" }}>
                <strong>Raw Result / Content:</strong>
                <p style={{ margin: "6px 0 0 0", color: "#334155", lineHeight: "1.5" }}>{selectedUpdate.content}</p>
              </div>

              <div style={{ background: "#eff6ff", padding: "14px", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
                <strong style={{ color: "#1e40af" }}>Patient-Friendly Explanation & Recommendations:</strong>
                <p style={{ margin: "6px 0 0 0", color: "#1e3a8a", lineHeight: "1.5" }}>
                  {selectedUpdate.description || "This reading falls within standard parameters. Continue with your routine health habits and consult your care provider if you have any questions."}
                </p>
              </div>
            </div>

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="roster-view-button roster-view-button--active" onClick={handleCloseUpdateModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatientHealthInsightsPage;