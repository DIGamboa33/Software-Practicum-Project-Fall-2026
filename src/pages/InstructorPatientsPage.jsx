import { useEffect, useState } from "react";

import {
  fetchInstructorPatients,
  fetchInstructorPatientDetails,
} from "../lib/api";

function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return "—";

  const birth = new Date(`${dateOfBirth}T00:00:00`);

  if (Number.isNaN(birth.getTime())) return "—";

  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();

  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() &&
      today.getDate() < birth.getDate())
  ) {
    age -= 1;
  }

  return age;
}

function formatDate(date) {
  if (!date) return "—";

  const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString();
}

function formatDateTime(date) {
  if (!date) return "—";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString();
}

function PatientSection({
  title,
  count,
  columns,
  rows,
  emptyMessage,
}) {
  return (
    <section
      className="panel"
      style={{
        padding: "20px",
        marginTop: "20px",
      }}
    >
      <h3 style={{ marginBottom: "16px" }}>
        {title} ({count})
      </h3>

      {rows.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      {column.render
                        ? column.render(row)
                        : row[column.key] ?? "—"}
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

export default function InstructorPatientsPage() {
  const [patients, setPatients] = useState([]);

  const [selectedPatient, setSelectedPatient] =
    useState(null);

  const [loading, setLoading] = useState(true);

  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [error, setError] = useState("");

  async function loadPatients() {
    try {
      setLoading(true);
      setError("");

      const response = await fetchInstructorPatients();

      setPatients(response.patients || []);
    } catch (err) {
      setError(
        err.message || "Unable to load patients."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);


  async function handleViewPatient(patientId) {
    try {
      setDetailsLoading(true);

      setError("");


      setSelectedPatient(null);

      const response =
        await fetchInstructorPatientDetails(patientId);

      setSelectedPatient(response.patient);
    } catch (err) {
      setError(
        err.message ||
          "Unable to load patient clinical records."
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  function closePatientDetails() {
    setSelectedPatient(null);
  }



  return (
    <div className="dashboard-page content-page">

      {/* PAGE HEADER */}

      <section className="page-heading">
        <div>
          <p className="section-label">
            Patient Management
          </p>

          <h1>Patients</h1>

          <p>
            View existing patient records and manage
            simulated patients.
          </p>
        </div>

      </section>

      {/* MESSAGES */}

      {error && (
        <p
          role="alert"
          className="login-error"
          style={{ marginBottom: "16px" }}
        >
          {error}
        </p>
      )}

      {/* PATIENT DIRECTORY */}

      <section className="panel data-panel">

        <div className="data-panel__toolbar">

          <strong>
            {patients.length}{" "}
            {patients.length === 1
              ? "patient"
              : "patients"}
          </strong>

        </div>

        {loading ? (
          <p style={{ padding: "24px" }}>
            Loading patients...
          </p>
        ) : (
          <div className="table-wrap admin-scroll-table">

            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Careflow ID</th>
                  <th>Age</th>
                  <th>Sex</th>
                  
                </tr>
              </thead>

              <tbody>

                {patients.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      No patients found.
                    </td>
                  </tr>
                ) : (
                  patients.map((patient) => (
                    <tr
                      key={patient.id}
                      role="button"
                      tabIndex={detailsLoading ? -1 : 0}
                      aria-label={`View details for ${patient.name || "patient"}`}
                      aria-disabled={detailsLoading}
                      onClick={() => {
                        if (!detailsLoading) handleViewPatient(patient.id);
                      }}
                      onKeyDown={(event) => {
                        if (!detailsLoading && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          handleViewPatient(patient.id);
                        }
                      }}
                      style={{ cursor: detailsLoading ? "wait" : "pointer" }}
                    >

                      <td>
                        <strong>
                          {patient.name ||
                            "Unnamed patient"}
                        </strong>
                      </td>

                      <td>
                        {patient.careflowId || "—"}
                      </td>

                      <td>
                        {calculateAge(
                          patient.dateOfBirth
                        )}
                      </td>

                      <td>
                        {patient.sex || "—"}
                      </td>



                    </tr>
                  ))
                )}

              </tbody>
            </table>

          </div>
        )}
      </section>

      {/* LOADING DETAILS */}

      {detailsLoading && (
        <section className="panel data-panel">
          <p style={{ padding: "24px" }}>
            Loading patient clinical records...
          </p>
        </section>
      )}

      {/* PATIENT DETAILS */}

      {selectedPatient && (
        <section className="panel data-panel">
          <div style={{ padding: "24px" }}>

            {/* PATIENT HEADER */}

            <div className="page-heading">
              <div>
                <p className="section-label">
                  Patient Record
                </p>

                <h2>{selectedPatient.name}</h2>

                <p>
                  Careflow ID:{" "}
                  {selectedPatient.careflowId || "—"}
                </p>
              </div>

              <button
                className="outline-button"
                type="button"
                onClick={closePatientDetails}
              >
                Close Details
              </button>
            </div>

            {/* DEMOGRAPHICS */}

            <section
              className="panel"
              style={{
                padding: "20px",
                marginTop: "20px",
              }}
            >
              <h3>Patient Information</h3>

              <p>
                <strong>Date of Birth:</strong>{" "}
                {formatDate(
                  selectedPatient.dateOfBirth
                )}
              </p>

              <p>
                <strong>Age:</strong>{" "}
                {calculateAge(
                  selectedPatient.dateOfBirth
                )}
              </p>

              <p>
                <strong>Sex:</strong>{" "}
                {selectedPatient.sex || "—"}
              </p>

              <p>
                <strong>Phone:</strong>{" "}
                {selectedPatient.phone || "—"}
              </p>

              <p>
                <strong>Address:</strong>{" "}
                {selectedPatient.address || "—"}
              </p>
            </section>

            {/* MEDICATIONS */}

            <PatientSection
              title="Medications"
              count={
                selectedPatient.medications?.length || 0
              }
              rows={
                selectedPatient.medications || []
              }
              emptyMessage="No medications recorded."
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

            <PatientSection
              title="Allergies"
              count={
                selectedPatient.allergies?.length || 0
              }
              rows={
                selectedPatient.allergies || []
              }
              emptyMessage="No allergies recorded."
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

            <PatientSection
              title="Medical History"
              count={
                selectedPatient.medicalHistory?.length || 0
              }
              rows={
                selectedPatient.medicalHistory || []
              }
              emptyMessage="No medical history recorded."
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
                  render: (item) =>
                    formatDate(item.diagnosed_date),
                },
                {
                  key: "notes",
                  label: "Notes",
                },
              ]}
            />

            {/* APPOINTMENTS */}

            <PatientSection
              title="Appointments"
              count={
                selectedPatient.appointments?.length || 0
              }
              rows={
                selectedPatient.appointments || []
              }
              emptyMessage="No appointments recorded."
              columns={[
                {
                  key: "appointment_date",
                  label: "Date",
                  render: (item) =>
                    formatDateTime(
                      item.appointment_date
                    ),
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

            {/* VITALS */}

            <PatientSection
              title="Vitals"
              count={
                selectedPatient.vitals?.length || 0
              }
              rows={
                selectedPatient.vitals || []
              }
              emptyMessage="No vitals recorded."
              columns={[
                {
                  key: "blood_pressure",
                  label: "Blood Pressure",
                },
                {
                  key: "heart_rate",
                  label: "Heart Rate",
                  render: (item) =>
                    item.heart_rate != null
                      ? `${item.heart_rate} bpm`
                      : "—",
                },
                {
                  key: "weight_lbs",
                  label: "Weight",
                  render: (item) =>
                    item.weight_lbs != null
                      ? `${item.weight_lbs} lbs`
                      : "—",
                },
                {
                  key: "blood_glucose_mg_dl",
                  label: "Glucose",
                  render: (item) =>
                    item.blood_glucose_mg_dl != null
                      ? `${item.blood_glucose_mg_dl} mg/dL`
                      : "—",
                },
              ]}
            />

          </div>
        </section>
      )}

    </div>
  );
}