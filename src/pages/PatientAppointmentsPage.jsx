import { useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchPatientAppointments, fetchPatientVitals } from "../lib/api";

function PatientAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming");
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [appointmentsPerPage, setAppointmentsPerPage] = useState(5);

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedVitals, setSelectedVitals] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  async function loadData() {
    try {
      setIsLoading(true);
      const [aptData, vitalsData] = await Promise.all([
        fetchPatientAppointments(),
        fetchPatientVitals()
      ]);
      setAppointments(aptData);
      setVitals(vitalsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load appointments data.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const now = new Date();
  const upcoming = appointments.filter((a) => new Date(a.appointment_date) >= now);
  const past = appointments.filter((a) => new Date(a.appointment_date) < now);
  const displayedAppointments = activeTab === "upcoming" ? upcoming : past;
  
  const appointmentStatusData = useMemo(() => {
    const totals = appointments.reduce((counts, appointment) => {
      const status = appointment.status || "Unspecified";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    return Object.entries(totals).map(([name, count]) => ({ name, appointments: count }));
  }, [appointments]);

  const visibleAppointments = displayedAppointments.slice(
    (appointmentPage - 1) * appointmentsPerPage,
    appointmentPage * appointmentsPerPage,
  );
  const timelineAppointments = [...appointments]
    .sort((first, second) => new Date(first.appointment_date) - new Date(second.appointment_date))
    .slice(0, 6);

  function handleOpenModal(apt) {
    setSelectedAppointment(apt);
    setSelectedVitals(vitals.find((v) => v.appointment_id === apt.id) || null);
    setShowDetailModal(true);
  }

  function handleCloseModal() {
    setShowDetailModal(false);
    setSelectedAppointment(null);
    setSelectedVitals(null);
  }

  if (isLoading) {
    return (
      <div className="dashboard-page content-page">
        <p className="directory-loading">Loading appointments…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">My health</p>
          <h1><Icon name="calendar" size={25} /> Appointments</h1>
          <p>Manage your upcoming visits and review past consultations and vitals.</p>
        </div>
      </section>

      {error && <section className="panel directory-error" style={{ marginTop: "20px" }}>{error}</section>}

      <div className="case-tabs-bar" style={{ marginTop: "24px" }}>
        <div className="case-tabs">
          <button
            type="button"
            className={`case-tab ${activeTab === "upcoming" ? "case-tab--active" : ""}`}
            onClick={() => { setActiveTab("upcoming"); setAppointmentPage(1); }}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            className={`case-tab ${activeTab === "past" ? "case-tab--active" : ""}`}
            onClick={() => { setActiveTab("past"); setAppointmentPage(1); }}
          >
            Past History ({past.length})
          </button>
        </div>
      </div>

      <section className="patient-appointment-insights">
        <article className="panel patient-chart-card">
          <div className="panel__header"><div><p className="section-label">Visit overview</p><h2>Appointments by status</h2></div><Icon name="chart" size={19} /></div>
          {appointmentStatusData.length ? (
            <div className="patient-chart-canvas"><ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={appointmentStatusData} dataKey="appointments" innerRadius={54} nameKey="name" outerRadius={82} paddingAngle={3}>{appointmentStatusData.map((item, index) => <Cell fill={["#6277d8", "#45bca2", "#f0a650", "#a175d8"][index % 4]} key={item.name} />)}</Pie><Tooltip formatter={(value) => [`${value} appointments`, "Count"]} /><Legend /></PieChart></ResponsiveContainer></div>
          ) : <p className="directory-loading">Appointment activity will appear when visits are scheduled.</p>}
        </article>

        <article className="panel patient-timeline-card">
          <div className="panel__header"><div><p className="section-label">Care timeline</p><h2>Appointment journey</h2></div><Icon name="calendar" size={19} /></div>
          {timelineAppointments.length ? (
            <ol className="patient-appointment-timeline">
              {timelineAppointments.map((appointment) => {
                const date = new Date(appointment.appointment_date);
                return (
                  <li key={appointment.id} onClick={() => handleOpenModal(appointment)} style={{ cursor: "pointer" }}>
                    <time>{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                    <div><strong>{appointment.reason}</strong><span>{appointment.location || "Location to be confirmed"}</span></div>
                    <em>{appointment.status}</em>
                  </li>
                );
              })}
            </ol>
          ) : <p className="directory-loading">Your care timeline will appear when appointments are scheduled.</p>}
        </article>
      </section>

      <section className="panel appointment-page-panel">
        <div className="appointment-page-list patient-scroll-list">
          {displayedAppointments.length === 0 ? (
            <p className="empty-list-message" style={{ padding: "30px", textAlign: "center" }}>
              No {activeTab} appointments found.
            </p>
          ) : (
            visibleAppointments.map((apt) => {
              const aptDate = new Date(apt.appointment_date);
              const monthStr = aptDate.toLocaleString("default", { month: "short" }).toUpperCase();
              const dayNum = aptDate.getDate();
              const timeStr = aptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              const matchedVitals = vitals.find((v) => v.appointment_id === apt.id);

              return (
                <div 
                  className="appointment-row" 
                  key={apt.id} 
                  onClick={() => handleOpenModal(apt)}
                  style={{ cursor: "pointer", transition: "background 0.2s" }}
                >
                  <time>
                    {monthStr} {dayNum}
                    <span style={{ display: "block", fontSize: "10px", color: "#939bac" }}>{timeStr}</span>
                  </time>
                  <span className="appointment-row__line" />
                  <div>
                    <h3>{apt.reason}</h3>
                    <p>{apt.location}</p>

                    {activeTab === "past" && matchedVitals && (
                      <div className="preview-label" style={{ marginTop: "10px", display: "flex", gap: "14px", flexWrap: "wrap", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px" }}>
                        <span><strong>BP:</strong> {matchedVitals.blood_pressure}</span>
                        <span><strong>HR:</strong> {matchedVitals.heart_rate} bpm</span>
                        <span><strong>Wt:</strong> {matchedVitals.weight_lbs} lbs</span>
                        <span><strong>Glucose:</strong> {matchedVitals.blood_glucose_mg_dl} mg/dL</span>
                        {matchedVitals.description && (
                          <span style={{ width: "100%", color: "#475569", fontStyle: "italic", fontSize: "12px" }}>
                            Description: {matchedVitals.description}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`status-badge status-badge--${apt.status.toLowerCase()}`}>
                    {apt.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <Pagination currentPage={appointmentPage} itemLabel={`${activeTab} appointments`} onPageChange={setAppointmentPage} onPageSizeChange={(size) => { setAppointmentsPerPage(size); setAppointmentPage(1); }} pageSize={appointmentsPerPage} totalItems={displayedAppointments.length} />
      </section>

      {showDetailModal && selectedAppointment && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div className="modal-content panel" style={{ background: "#fff", maxWidth: "600px", width: "100%", padding: "24px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2>Appointment Details</h2>
              <button type="button" onClick={handleCloseModal} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>
            
            <div style={{ display: "grid", gap: "14px", fontSize: "14px" }}>
              <div><strong>Reason / Consultation:</strong> {selectedAppointment.reason}</div>
              <div><strong>Date & Time:</strong> {new Date(selectedAppointment.appointment_date).toLocaleString()}</div>
              <div><strong>Location:</strong> {selectedAppointment.location || "Location to be confirmed"}</div>
              <div><strong>Status:</strong> <span className={`status-badge status-badge--${selectedAppointment.status.toLowerCase()}`}>{selectedAppointment.status}</span></div>

              <hr style={{ border: "0", borderTop: "1px solid #edf0f5", margin: "10px 0" }} />

              <h3>Recorded Vitals</h3>
              {selectedVitals ? (
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", display: "grid", gap: "8px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div><strong>Blood Pressure:</strong> {selectedVitals.blood_pressure}</div>
                    <div><strong>Heart Rate:</strong> {selectedVitals.heart_rate} bpm</div>
                    <div><strong>Weight:</strong> {selectedVitals.weight_lbs} lbs</div>
                    <div><strong>Blood Glucose:</strong> {selectedVitals.blood_glucose_mg_dl} mg/dL</div>
                  </div>
                  {selectedVitals.description && (
                    <div style={{ marginTop: "6px", background: "#fff", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                      <strong>Result Analysis & Recommendations:</strong>
                      <p style={{ margin: "4px 0 0 0", color: "#334155" }}>{selectedVitals.description}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: "#64748b" }}>No vitals recorded for this session.</p>
              )}
            </div>

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="roster-view-button roster-view-button--active" onClick={handleCloseModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PatientAppointmentsPage;