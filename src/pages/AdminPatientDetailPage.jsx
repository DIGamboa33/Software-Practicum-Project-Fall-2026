
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchAdminPatient } from "../lib/api";
import "./AdminPatientDetailPage.css";

// Display a readable value when a database field is empty.
function showValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Not recorded";
  }

  return value;
}

// Format a database date.
function formatDate(value, includeTime = false) {
  if (!value) return "Not recorded";

  let date;

  if (includeTime) {
    date = new Date(value);
  } else {
    // Avoid moving date-only values backward due to timezones.
    date = new Date(String(value).slice(0, 10) + "T00:00:00");
  }

  if (Number.isNaN(date.getTime())) return "Not recorded";

  return includeTime
    ? date.toLocaleString()
    : date.toLocaleDateString();
}

// Calculate age based on the patient's date of birth.
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return "Not recorded";

  const birth = new Date(
    String(dateOfBirth).slice(0, 10) + "T00:00:00"
  );

  if (Number.isNaN(birth.getTime())) return "Not recorded";

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();

  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() < birth.getDate())
  ) {
    age--;
  }

  return age >= 0 ? `${age} years` : "Not recorded";
}

// Reusable field for demographics and account details.
function PatientField({ label, value }) {
  return (
    <div className="patient-chart-field">
      <dt>{label}</dt>
      <dd>{showValue(value)}</dd>
    </div>
  );
}

// Reusable table to display clinical records.
function PatientTable({
  title,
  description,
  records,
  columns,
  emptyMessage,
}) {
  return (
    <section className="panel patient-chart-panel">
      <div className="patient-chart-panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <span className="patient-chart-count">
          {records.length} {records.length === 1 ? "record" : "records"}
        </span>
      </div>

      {records.length === 0 ? (
        <p className="patient-chart-empty">{emptyMessage}</p>
      ) : (
        <div className="patient-chart-table-wrap">
          <table className="patient-chart-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {records.map((record, index) => (
                <tr key={record.id || index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {showValue(
                        column.render
                          ? column.render(record)
                          : record[column.key]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminPatientDetailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const patientId = searchParams.get("id");

  const [patient, setPatient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Load patient information from the Express backend.
  useEffect(() => {
    let active = true;

    async function loadPatient() {
      if (!patientId) {
        setError("No patient was selected.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError("");
        setPatient(null);

        const data = await fetchAdminPatient(patientId);

        if (active) {
          setPatient(data);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError.message || "Unable to load patient record."
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadPatient();

    return () => {
      active = false;
    };
  }, [patientId]);

  if (isLoading) {
    return (
      <div className="dashboard-page content-page">
        <p>Loading patient information...</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="dashboard-page content-page">
        <h1>Unable to load patient</h1>
        <p>{error || "Patient not found."}</p>

        <button
          className="outline-button"
          onClick={() => navigate("/admin/patients")}
          type="button"
        >
          Back to Patients
        </button>
      </div>
    );
  }

  // Save each clinical section into a simple array.
  const medications = patient.medications || [];
  const allergies = patient.allergies || [];
  const medicalHistory = patient.medicalHistory || [];
  const appointments = patient.appointments || [];
  const vitals = patient.vitals || [];

  // Find the most recent vital signs record.
  const sortedVitals = [...vitals].sort((a, b) => {
    const dateA =
      a.recorded_at || a.measured_at || a.created_at || "";

    const dateB =
      b.recorded_at || b.measured_at || b.created_at || "";

    return new Date(dateB) - new Date(dateA);
  });

  const latestVitals = sortedVitals[0];

  // Build initials for the patient avatar.
  const initials = (
    (patient.firstName?.[0] || "") +
    (patient.lastName?.[0] || "")
  ).toUpperCase() || "PT";

  return (
    <div className="dashboard-page content-page admin-patient-detail">

      {/* PAGE TITLE */}
      <section className="page-heading">
        <div>
          <p className="section-label">Patient directory</p>
          <h1>Patient Details</h1>
          <p>
            Review patient demographics, medications, and clinical history.
          </p>
        </div>

        <button
          className="outline-button"
          type="button"
          onClick={() => navigate("/admin/patients")}
        >
          Back to Patients
        </button>
      </section>

      {/* PATIENT HEADER */}
      <section className="panel patient-chart-header">
        <div className="patient-chart-identity">
          <div className="patient-chart-avatar">
            {initials}
          </div>

          <div className="patient-chart-name">
            <p className="section-label">Patient profile</p>
            <h2>{patient.name || "Unnamed patient"}</h2>
            <p>
              Careflow ID: {patient.careflowId || "Not assigned"}
            </p>
          </div>

          <span
            className={
              patient.isActive
                ? "patient-chart-status active"
                : "patient-chart-status inactive"
            }
          >
            {patient.isActive ? "Active account" : "Inactive account"}
          </span>
        </div>

        {/* SUMMARY CARDS */}
        <div className="patient-chart-stats">
          <div className="patient-chart-stat">
            <strong>{medications.length}</strong>
            <span>Medications on file</span>
          </div>

          <div className="patient-chart-stat">
            <strong>{allergies.length}</strong>
            <span>Allergy records</span>
          </div>

          <div className="patient-chart-stat">
            <strong>{medicalHistory.length}</strong>
            <span>Medical conditions</span>
          </div>

          <div className="patient-chart-stat">
            <strong>{appointments.length}</strong>
            <span>Appointments</span>
          </div>
        </div>
      </section>

      {/* MAIN CLINICAL CONTENT */}
      <div className="patient-chart-layout">

        <div className="patient-chart-main">

          {/* MEDICATIONS */}
          <PatientTable
            title="Medication List"
            description="Medications recorded for this patient."
            records={medications}
            emptyMessage="No medications have been recorded."
            columns={[
              {
                key: "medication_name",
                label: "Medication",
              },
              {
                key: "dosage",
                label: "Dosage",
              },
              {
                key: "frequency",
                label: "Frequency",
              },
              {
                key: "status",
                label: "Status",
              },
            ]}
          />

          {/* ALLERGIES */}
          <PatientTable
            title="Allergies"
            description="Known entries for allergies and reactions."
            records={allergies}
            emptyMessage="No allergy information recorded. Allergy status has not been verified."
            columns={[
              {
                key: "allergen",
                label: "Allergen",
              },
              {
                key: "reaction",
                label: "Reaction",
              },
              {
                key: "severity",
                label: "Severity",
              },
              {
                key: "status",
                label: "Status",
              },
            ]}
          />

          {/* MEDICAL HISTORY */}
          <PatientTable
            title="Medical History"
            description="Previously recorded medical conditions."
            records={medicalHistory}
            emptyMessage="No medical history has been recorded."
            columns={[
              {
                key: "condition_name",
                label: "Condition",
              },
              {
                key: "status",
                label: "Status",
              },
              {
                key: "diagnosed_date",
                label: "Diagnosed",
                render: (record) =>
                  formatDate(record.diagnosed_date),
              },
              {
                key: "notes",
                label: "Notes",
              },
            ]}
          />
        </div>

        {/* RIGHT SIDEBAR */}
        <aside className="patient-chart-sidebar">

          {/* DEMOGRAPHICS */}
          <section className="panel patient-chart-panel">
            <div className="patient-chart-panel-heading">
              <div>
                <h2>Demographics</h2>
                <p>Personal and contact information.</p>
              </div>
            </div>

            <dl className="patient-chart-info">
              <PatientField
                label="Date of Birth"
                value={formatDate(patient.dateOfBirth)}
              />

              <PatientField
                label="Age"
                value={calculateAge(patient.dateOfBirth)}
              />

              <PatientField
                label="Sex"
                value={patient.sex}
              />

              <PatientField
                label="Phone"
                value={patient.phone}
              />

              <PatientField
                label="Address"
                value={patient.address}
              />

              <PatientField
                label="Primary Provider"
                value={patient.primaryProvider || "Not assigned"}
              />
            </dl>
          </section>

          {/* VITAL SIGNS */}
          <section className="panel patient-chart-panel">
            <div className="patient-chart-panel-heading">
              <div>
                <h2>Latest Vital Signs</h2>
                <p>Most recent measurements on file.</p>
              </div>
            </div>

            {latestVitals ? (
              <>
                <dl className="patient-chart-info">
                  <PatientField
                    label="Blood Pressure"
                    value={latestVitals.blood_pressure}
                  />

                  <PatientField
                    label="Heart Rate"
                    value={
                      latestVitals.heart_rate != null
                        ? `${latestVitals.heart_rate} bpm`
                        : null
                    }
                  />

                  <PatientField
                    label="Weight"
                    value={
                      latestVitals.weight_lbs != null
                        ? `${latestVitals.weight_lbs} lbs`
                        : null
                    }
                  />

                  <PatientField
                    label="Blood Glucose"
                    value={
                      latestVitals.blood_glucose_mg_dl != null
                        ? `${latestVitals.blood_glucose_mg_dl} mg/dL`
                        : null
                    }
                  />

                  <PatientField
                    label="Recorded"
                    value={formatDate(
                      latestVitals.recorded_at ||
                      latestVitals.measured_at ||
                      latestVitals.created_at
                    )}
                  />
                </dl>

                <p className="patient-chart-note">
                  {vitals.length} vital sign records on file.
                </p>
              </>
            ) : (
              <p className="patient-chart-empty">
                No vital signs recorded.
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* APPOINTMENTS */}
      <PatientTable
        title="Appointments"
        description="Upcoming and previous patient visits."
        records={appointments}
        emptyMessage="No appointments have been recorded."
        columns={[
          {
            key: "appointment_date",
            label: "Date",
            render: (record) =>
              formatDate(record.appointment_date, true),
          },
          {
            key: "reason",
            label: "Reason",
          },
          {
            key: "location",
            label: "Location",
          },
          {
            key: "status",
            label: "Status",
          },
        ]}
      />

      {/* ACCOUNT INFORMATION */}
      <section className="panel patient-chart-panel">
        <div className="patient-chart-panel-heading">
          <div>
            <h2>Account Information</h2>
            <p>Administrative information associated with this account.</p>
          </div>
        </div>

        <dl className="patient-chart-account-grid">
          <PatientField
            label="First Name"
            value={patient.firstName}
          />

          <PatientField
            label="Last Name"
            value={patient.lastName}
          />

          <PatientField
            label="Email Address"
            value={patient.email}
          />

          <PatientField
            label="Careflow ID"
            value={patient.careflowId}
          />

          <PatientField
            label="Account Created"
            value={formatDate(patient.createdAt)}
          />

          <PatientField
            label="Patient Record Updated"
            value={formatDate(patient.updatedAt)}
          />

          <PatientField
            label="Email Confirmed"
            value={patient.emailConfirmed ? "Yes" : "No"}
          />

          <PatientField
            label="Account Status"
            value={patient.isActive ? "Active" : "Inactive"}
          />
        </dl>
      </section>
    </div>
  );
}

export default AdminPatientDetailPage;
