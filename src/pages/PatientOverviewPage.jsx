import { useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchPatientDashboard } from "../lib/api";

function PatientOverviewPage({ user }) {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");
  const [medicationPage, setMedicationPage] = useState(1);
  const [medicationsPerPage, setMedicationsPerPage] = useState(5);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPerPage, setHistoryPerPage] = useState(5);

  useEffect(() => {
    let isCurrent = true;
    async function loadDashboard() {
      try {
        const result = await fetchPatientDashboard();
        if (isCurrent) setDashboard(result);
      } catch (loadError) {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
      }
    }
    loadDashboard();
    return () => { isCurrent = false; };
  }, []);

  const firstName = user.name.split(" ")[0];
  const metrics = dashboard
    ? [
        { label: "Active medications", value: dashboard.metrics.activeMedications, note: "Current prescriptions", tone: "indigo", icon: "grid" },
        { label: "Upcoming visits", value: dashboard.metrics.upcomingAppointments, note: "Scheduled appointments", tone: "teal", icon: "calendar" },
        { label: "Clinical alerts", value: dashboard.metrics.unreadUpdates, note: "Unread updates", tone: "amber", icon: "bell" },
      ]
    : [];
  const medicationStatusData = useMemo(() => {
    const totals = (dashboard?.medications || []).reduce((counts, medication) => {
      const status = medication.status || "Unspecified";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [dashboard]);
  const visibleMedications = (dashboard?.medications || []).slice((medicationPage - 1) * medicationsPerPage, medicationPage * medicationsPerPage);
  const visibleHistory = (dashboard?.medicalHistory || []).slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage);

  return (
    <div className="dashboard-page content-page instructor-workspace">
      <section className="page-heading">
        <div>
          <p className="section-label">My health · overview</p>
          <h1>Good afternoon, {firstName}</h1>
          <p>Review your diagnoses, active prescriptions, and upcoming care visits.</p>
        </div>
      </section>

      {error && <section className="panel directory-error">{error}</section>}
      {!dashboard && !error && <section className="panel directory-loading">Loading your health portal…</section>}

      {dashboard && (
        <>
          <section className="instructor-overview-metrics">
            {metrics.map((metric) => (
              <article className={`panel instructor-overview-metric instructor-overview-metric--${metric.tone}`} key={metric.label}>
                <div className="patient-metric-heading"><span>{metric.label}</span><Icon name={metric.icon} size={17} /></div>
                <strong>{metric.value}</strong>
                <small>{metric.note}</small>
              </article>
            ))}
          </section>

          <section className="panel patient-chart-card">
            <div className="panel__header"><div><p className="section-label">Treatment overview</p><h2>Medication status</h2></div><Icon name="chart" size={19} /></div>
            {medicationStatusData.length ? (
              <div className="patient-chart-canvas"><ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={medicationStatusData} dataKey="value" innerRadius={54} nameKey="name" outerRadius={82} paddingAngle={3}>{medicationStatusData.map((item, index) => <Cell fill={["#6277d8", "#45bca2", "#f0a650", "#a175d8"][index % 4]} key={item.name} />)}</Pie><Tooltip formatter={(value) => [`${value} medications`, "Count"]} /><Legend /></PieChart></ResponsiveContainer></div>
            ) : <p className="directory-loading">Medication status will appear when prescriptions are added.</p>}
          </section>

          <section className="instructor-overview-grid">
            <article className="panel classroom-health-panel">
              <div className="panel__header">
                <div><p className="section-label">Treatments</p><h2>Current Medications</h2></div>
                <span className="directory-live-indicator">● Live database</span>
              </div>
              {dashboard.medications.length ? (
                <>
                  <div className="classroom-health-list patient-scroll-list">
                  {visibleMedications.map((med) => (
                    <article key={med.id}>
                      <div className="classroom-health-list__heading">
                        <div><h3>{med.medication_name}</h3><p>{med.dosage} · {med.frequency}</p></div>
                        <span>{med.status}</span>
                      </div>
                      <div className="classroom-stat-line"><span>Prescribed by: {med.prescribed_by || "Provider"}</span></div>
                    </article>
                  ))}
                  </div>
                  <Pagination currentPage={medicationPage} itemLabel="medications" onPageChange={setMedicationPage} onPageSizeChange={(size) => { setMedicationsPerPage(size); setMedicationPage(1); }} pageSize={medicationsPerPage} totalItems={dashboard.medications.length} />
                </>
              ) : (
                <p className="directory-loading">No active medications found.</p>
              )}
            </article>

            <article className="panel review-queue-panel">
              <div className="panel__header"><div><p className="section-label">Diagnoses</p><h2>Medical History</h2></div></div>
              {dashboard.medicalHistory.length ? (
                <>
                  <div className="classroom-health-list patient-scroll-list">
                  {visibleHistory.map((item) => (
                    <article key={item.id} style={{ marginBottom: "12px" }}>
                      <strong>{item.condition_name}</strong>
                      <p><small>Status: {item.status} · Diagnosed: {item.diagnosed_date || "N/A"}</small></p>
                    </article>
                  ))}
                  </div>
                  <Pagination currentPage={historyPage} itemLabel="history records" onPageChange={setHistoryPage} onPageSizeChange={(size) => { setHistoryPerPage(size); setHistoryPage(1); }} pageSize={historyPerPage} totalItems={dashboard.medicalHistory.length} />
                </>
              ) : (
                <p className="directory-loading">No medical history records found.</p>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

export default PatientOverviewPage;
