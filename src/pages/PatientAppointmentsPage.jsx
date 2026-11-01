import { useEffect, useState } from "react";
import { fetchPatientAppointments, fetchPatientVitals } from "../lib/api";

function PatientAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("upcoming");
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [reason, setReason] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [location, setLocation] = useState("Main Clinic Room A");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          <h1>Appointments</h1>
          <p>Manage your upcoming visits and review past consultations and vitals.</p>
        </div>
      
      </section>

      {error && <section className="panel directory-error" style={{ marginTop: "20px" }}>{error}</section>}

      {/* Tabs bar */}
      <div className="case-tabs-bar" style={{ marginTop: "24px" }}>
        <div className="case-tabs">
          <button
            type="button"
            className={`case-tab ${activeTab === "upcoming" ? "case-tab--active" : ""}`}
            onClick={() => setActiveTab("upcoming")}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            className={`case-tab ${activeTab === "past" ? "case-tab--active" : ""}`}
            onClick={() => setActiveTab("past")}
          >
            Past History ({past.length})
          </button>
        </div>
      </div>

      {/* Appointments List */}
      <section className="panel appointment-page-panel">
        <div className="appointment-page-list">
          {displayedAppointments.length === 0 ? (
            <p className="empty-list-message" style={{ padding: "30px", textAlign: "center" }}>
              No {activeTab} appointments found.
            </p>
          ) : (
            displayedAppointments.map((apt) => {
              const aptDate = new Date(apt.appointment_date);
              const monthStr = aptDate.toLocaleString("default", { month: "short" }).toUpperCase();
              const dayNum = aptDate.getDate();
              const timeStr = aptDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              // Find vitals linked to this specific past appointment
              const matchedVitals = vitals.find((v) => v.appointment_id === apt.id);

              return (
                <div className="appointment-row" key={apt.id}>
                  <time>
                    {monthStr} {dayNum}
                    <span style={{ display: "block", fontSize: "10px", color: "#939bac" }}>{timeStr}</span>
                  </time>
                  <span className="appointment-row__line" />
                  <div>
                    <h3>{apt.reason}</h3>
                    <p>{apt.location}</p>

                    {/* Vitals breakdown for past appointments */}
                    {activeTab === "past" && matchedVitals && (
                      <div className="preview-label" style={{ marginTop: "10px", display: "flex", gap: "14px", flexWrap: "wrap", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px" }}>
                        <span><strong>BP:</strong> {matchedVitals.blood_pressure}</span>
                        <span><strong>HR:</strong> {matchedVitals.heart_rate} bpm</span>
                        <span><strong>Wt:</strong> {matchedVitals.weight_lbs} lbs</span>
                        <span><strong>Glucose:</strong> {matchedVitals.blood_glucose_mg_dl} mg/dL</span>
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
      </section>

      
    </div>
  );
}

export default PatientAppointmentsPage;