import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PharmacyNotesPage from "./PharmacyNotesPage";
import {
  fetchStudentCases,
  fetchStudentPharmacyNotes,
  updateStudentCaseStatus,
} from "../lib/api";

const tabs = ["Overview", "Medications", "Labs", "Notes", "Appointments", "Referrals"];

const statuses = ["Scheduled", "Checked in", "Roomed", "In progress", "Checked out"];

const actions = {
  Scheduled: "Check In",
  "Checked in": "Mark as Roomed",
  Roomed: "Start Encounter",
  "In progress": "Check Out",
};

const text = (value) =>
  value == null || value === "" ? "Not recorded" : String(value);

const formattedDate = (value) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

const ordered = (values, keys) =>
  Array.isArray(values)
    ? [...values].sort((a, b) => {
        const time = (item) =>
          new Date(keys.map((key) => item?.[key]).find(Boolean) || 0).getTime() || 0;
        return time(b) - time(a);
      })
    : [];

function Value({ value }) {
  if (value == null || value === "") return "Not recorded";

  if (Array.isArray(value)) {
    return value.length ? (
      <ul>
        {value.map((item, index) => (
          <li key={item?.id ?? index}>
            <Value value={item} />
          </li>
        ))}
      </ul>
    ) : "Not recorded";
  }

  if (typeof value === "object") {
    if (value.name || value.label || value.medication_name) {
      return value.name || value.label || value.medication_name;
    }

    return (
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd><Value value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }

  return String(value);
}

function Card({ title, children, action }) {
  return (
    <section className="panel data-panel case-section">
      <div className="case-section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd><Value value={value} /></dd>
    </div>
  );
}

function DataTable({ columns, rows }) {
  if (!rows.length) {
    return <p className="case-help-text">No records available.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([name]) => <th key={name}>{name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={item.id ?? index}>
              {columns.map(([name, render]) => (
                <td key={name}>{render(item)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StudentCaseDetailPage({
  selectedCaseId,
  onNavigate,
  user,
}) {
  const [params] = useSearchParams();

  const caseId =
    params.get("id") ??
    params.get("caseId") ??
    selectedCaseId;

  const [patient, setPatient] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [noteCount, setNoteCount] = useState(0);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setPatient(null);
    setTab("Overview");

    async function loadPatient() {
      try {
        if (caseId == null) throw new Error("No case selected.");

        const result = await fetchStudentCases();
        const cases = Array.isArray(result) ? result : result?.cases || [];

        const selected =
          cases.find((item) => String(item.id) === String(caseId)) ||
          cases.find((item) => String(item.assignment_id) === String(caseId));

        if (!selected) throw new Error("Case not found.");
        if (active) setPatient(selected);
      } catch (err) {
        if (active) setError(err.message || "Unable to load patient.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPatient();

    return () => {
      active = false;
    };
  }, [caseId]);

  useEffect(() => {
    if (!patient) {
      setNoteCount(0);
      return;
    }

    let active = true;

    const assignmentId = patient.assignment_id;

    async function updateCount() {
      if (!assignmentId) {
        if (active) setNoteCount(0);
        return;
      }

      try {
        const result = await fetchStudentPharmacyNotes(assignmentId);

        const notes = Array.isArray(result)
          ? result
          : result?.notes || [];

        if (active) {
          setNoteCount(notes.length);
        }
      } catch (error) {
        console.error("Unable to load note count:", error);

        if (active) {
          setNoteCount(0);
        }
      }
    }

    updateCount();

    const handleNotesUpdated = () => {
      updateCount();
    };

    window.addEventListener("focus", handleNotesUpdated);
    window.addEventListener("notes-updated", handleNotesUpdated);

    return () => {
      active = false;

      window.removeEventListener("focus", handleNotesUpdated);
      window.removeEventListener("notes-updated", handleNotesUpdated);
    };
  }, [patient?.assignment_id, tab]);

  async function advanceStatus() {
    const current =
      patient?.encounter_status ??
      patient?.starting_encounter_status ??
      "Scheduled";

    const index = statuses.indexOf(current);

    if (updating || index < 0 || index >= statuses.length - 1) return;

    setUpdating(true);
    setError("");

    try {
      const next = statuses[index + 1];

      await updateStudentCaseStatus(patient.assignment_id, next);

      setPatient((previous) => ({
        ...previous,
        encounter_status: next,
      }));
    } catch (err) {
      setError(err.message || "Unable to update encounter status.");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page content-page">
        Loading patient record...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="dashboard-page content-page">
        <p role="alert">{error || "Case not found."}</p>
        <button
          className="secondary-button"
          onClick={() => onNavigate?.("overview")}
        >
          Back to My Cases
        </button>
      </div>
    );
  }

  const encounter =
    patient.encounter_status ??
    patient.starting_encounter_status ??
    "Scheduled";

  const labs = ordered(patient.labs, [
    "collected_at",
    "recorded_at",
    "date",
  ]);

  const appointments = Array.isArray(patient.appointments)
    ? patient.appointments
    : [];

  const referrals = Array.isArray(patient.referrals)
    ? patient.referrals
    : [];

  const vitals = Array.isArray(patient.vitals)
    ? ordered(patient.vitals, [
        "recorded_at",
        "measured_at",
        "date",
      ])[0]
    : patient.vitals ?? patient.current_vitals;

  const allergies = patient.allergies;

  const categorized =
    allergies &&
    !Array.isArray(allergies) &&
    typeof allergies === "object";

  const allergyGroups = {
    Medication:
      patient.medication_allergies ??
      (categorized ? allergies.medication ?? allergies.medications : null),
    Food:
      patient.food_allergies ??
      (categorized ? allergies.food : null),
    Environmental:
      patient.environmental_allergies ??
      (categorized ? allergies.environmental : null),
  };

  const hasCategories = Object.values(allergyGroups).some(
    (value) => value != null
  );

  const nextAppointment =
    [...appointments]
      .filter((item) => {
        const when = new Date(
          item.scheduled_at ??
          item.appointment_date ??
          item.date
        ).getTime();

        return (
          when >= Date.now() &&
          !["cancelled", "canceled"].includes(
            String(item.status || "").toLowerCase()
          )
        );
      })
      .sort((a, b) =>
        new Date(a.scheduled_at ?? a.appointment_date ?? a.date) -
        new Date(b.scheduled_at ?? b.appointment_date ?? b.date)
      )[0] ?? patient.next_appointment;

  const vitalsList = [
    [
      "Blood Pressure",
      vitals?.blood_pressure ??
        (vitals?.systolic != null && vitals?.diastolic != null
          ? `${vitals.systolic}/${vitals.diastolic} mmHg`
          : null),
    ],
    ["Heart Rate", vitals?.heart_rate ?? vitals?.pulse],
    ["Temperature", vitals?.temperature],
    ["Respiratory Rate", vitals?.respiratory_rate ?? vitals?.respirations],
    ["Oxygen Saturation", vitals?.spo2 ?? vitals?.oxygen_saturation],
    ["Weight", vitals?.weight],
  ];

  const action = (target) => (
    <button
      type="button"
      className="secondary-button"
      onClick={() => setTab(target)}
    >
      View All
    </button>
  );

  return (
    <div
      className="dashboard-page content-page"
      style={{ paddingTop: 16 }}
    >
      <section
        className="page-heading case-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 8,
          padding: 0,
        }}
      >
        <div>
          <p
            className="section-label"
            style={{ margin: "0 0 4px" }}
          >
            Student Patient Record · Case {patient.id}
          </p>

          <h1
            style={{
              margin: "0 0 4px",
              fontSize: 28,
              lineHeight: 1.2,
            }}
          >
            {patient.patient_name}
          </h1>

          <p style={{ margin: 0, fontSize: 14 }}>
            {text(patient.patient_age)} years ·{" "}
            {text(patient.patient_sex)} · {patient.title}
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => onNavigate?.("overview")}
          style={{ flexShrink: 0 }}
        >
          Back to My Cases
        </button>
      </section>

      {error && <p role="alert">{error}</p>}

      <div
        className="patient-workspace"
        style={{
          display: "grid",
          gridTemplateColumns: collapsed
            ? "50px minmax(0, 1fr)"
            : "150px minmax(0, 1fr)",
          gap: 12,
          alignItems: "start",
          marginTop: 0,
        }}
      >
        <aside
          className="panel data-panel"
          style={{
            padding: collapsed ? "10px 5px" : "12px 8px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
              marginBottom: 12,
            }}
          >
            {!collapsed && (
              <h2
                style={{
                  margin: 0,
                  fontSize: 13,
                  whiteSpace: "nowrap",
                }}
              >
                Patient Chart
              </h2>
            )}

            <button
              type="button"
              className="secondary-button"
              style={{
                padding: "5px 7px",
                minWidth: 26,
              }}
              onClick={() => setCollapsed(!collapsed)}
              aria-label={
                collapsed ? "Expand navigation" : "Collapse navigation"
              }
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <nav
            aria-label="Patient record sections"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                className="patient-nav-button"
                aria-current={tab === item ? "page" : undefined}
                title={item}
                onClick={() => setTab(item)}
                style={{
                  width: "100%",
                  padding: "11px 8px",
                  textAlign: collapsed ? "center" : "left",
                  border: `1px solid ${
                    tab === item ? "#16a78b" : "#e5e9f0"
                  }`,
                  borderRadius: 9,
                  background: tab === item ? "#16a78b" : "#f7f9fc",
                  color: tab === item ? "white" : "#53627b",
                  fontWeight: tab === item ? 700 : 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {collapsed
                  ? item[0]
                  : item === "Notes"
                    ? `Notes (${noteCount})`
                    : item}
              </button>
            ))}
          </nav>
        </aside>

        <main style={{ minWidth: 0 }}>
          <section
            className="panel data-panel"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              padding: "10px 16px",
              marginBottom: 12,
            }}
          >

            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <p
                className="section-label"
                style={{ margin: "0 0 4px", fontSize: 11 }}
              >
                Chief Complaint
              </p>

              <strong style={{ fontSize: 13 }}>
                {text(patient.chief_complaint)}
              </strong>
            </div>

            <div style={{ minWidth: 110 }}>
              <p
                className="section-label"
                style={{ margin: "0 0 4px", fontSize: 11 }}
              >
                Encounter Status
              </p>

              <span className="status-badge">
                {encounter}
              </span>
            </div>

            {actions[encounter] && (
              <button
                type="button"
                className="primary-button"
                disabled={updating}
                onClick={advanceStatus}
                style={{
                  padding: "8px 12px",
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {updating ? "Updating..." : actions[encounter]}
              </button>
            )}
          </section>

          {tab === "Overview" && (
            <>
              <div
                className="case-section-heading"
                style={{ marginBottom: 12 }}
              >
                <div>
                  <p
                    className="section-label"
                    style={{ margin: "0 0 4px" }}
                  >
                    Patient Overview
                  </p>

                  <h2 style={{ margin: 0 }}>
                    Clinical Summary
                  </h2>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
                  gap: 16,
                }}
              >
                <Card title="Demographics">
                  <dl className="detail-form-grid">
                    <Row label="Age" value={patient.patient_age} />
                    <Row label="Sex" value={patient.patient_sex} />
                    <Row
                      label="Date of Birth"
                      value={patient.date_of_birth ?? patient.dob}
                    />
                    <Row
                      label="MRN"
                      value={
                        patient.mrn ??
                        patient.medical_record_number
                      }
                    />
                  </dl>
                </Card>

                <Card title="Allergies">
                  {hasCategories ? (
                    Object.entries(allergyGroups).map(([label, value]) => (
                      <Row
                        key={label}
                        label={label}
                        value={value}
                      />
                    ))
                  ) : (
                    <Value value={allergies} />
                  )}
                </Card>

                <Card title="Diagnoses">
                  <Value
                    value={
                      patient.diagnoses ??
                      patient.diagnosis
                    }
                  />

                  <p className="case-help-text">
                    Provider-managed information.
                  </p>
                </Card>

                <Card title="Current Vitals">
                  {vitals ? (
                    <>
                      <dl className="detail-form-grid">
                        {vitalsList.map(([label, value]) => (
                          <Row
                            key={label}
                            label={label}
                            value={value}
                          />
                        ))}
                      </dl>

                      <p className="case-help-text">
                        Last recorded:{" "}
                        {formattedDate(
                          vitals.recorded_at ??
                          vitals.measured_at ??
                          vitals.date
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="case-help-text">
                      No vitals recorded.
                    </p>
                  )}
                </Card>

                <Card
                  title="Recent Labs"
                  action={action("Labs")}
                >
                  {labs.length ? (
                    <dl className="detail-form-grid">
                      {labs.slice(0, 5).map((lab, index) => (
                        <Row
                          key={lab.id ?? index}
                          label={
                            lab.test_name ??
                            lab.name ??
                            "Lab"
                          }
                          value={`${text(
                            lab.result ?? lab.value
                          )} ${lab.unit || ""}`}
                        />
                      ))}
                    </dl>
                  ) : (
                    <p className="case-help-text">
                      No structured labs recorded.
                    </p>
                  )}

                  {patient.results && (
                    <Row
                      label="Existing Clinical Results"
                      value={patient.results}
                    />
                  )}
                </Card>

                <Card
                  title="Next Appointment"
                  action={action("Appointments")}
                >
                  {nextAppointment ? (
                    typeof nextAppointment === "object" ? (
                      <dl className="detail-form-grid">
                        <Row
                          label="Appointment"
                          value={
                            nextAppointment.title ??
                            nextAppointment.type ??
                            "Appointment"
                          }
                        />

                        <Row
                          label="Date"
                          value={formattedDate(
                            nextAppointment.scheduled_at ??
                            nextAppointment.appointment_date ??
                            nextAppointment.date
                          )}
                        />

                        <Row
                          label="Provider"
                          value={nextAppointment.provider}
                        />
                      </dl>
                    ) : (
                      <Value value={nextAppointment} />
                    )
                  ) : (
                    <p className="case-help-text">
                      No upcoming appointment.
                    </p>
                  )}
                </Card>
              </div>

              <section
                className="panel data-panel case-section"
                style={{ marginTop: 16 }}
              >
                <h2>Additional Patient Information</h2>

                <dl className="detail-form-grid">
                  <Row
                    label="Chief Complaint"
                    value={patient.chief_complaint}
                  />

                  <Row
                    label="Medical History"
                    value={
                      patient.medical_history ??
                      patient.history
                    }
                  />

                  <Row
                    label="Surgical History"
                    value={patient.surgical_history}
                  />
                </dl>
              </section>
            </>
          )}

          {tab === "Medications" && (
            <Card title="Medications">
              <Value value={patient.medications} />

            </Card>
          )}

          {tab === "Labs" && (
            <Card title="Laboratory Results">
              <DataTable
                rows={labs}
                columns={[
                  [
                    "Test",
                    (item) =>
                      item.test_name ??
                      item.name ??
                      "Lab",
                  ],
                  [
                    "Result",
                    (item) =>
                      `${text(
                        item.result ?? item.value
                      )} ${item.unit || ""}`,
                  ],
                  [
                    "Reference Range",
                    (item) =>
                      text(item.reference_range),
                  ],
                  [
                    "Date",
                    (item) =>
                      formattedDate(
                        item.collected_at ??
                        item.recorded_at ??
                        item.date
                      ),
                  ],
                ]}
              />

              {patient.results && (
                <Row
                  label="Existing Clinical Results"
                  value={patient.results}
                />
              )}
            </Card>
          )}

          {tab === "Notes" && (
            <PharmacyNotesPage
              selectedCaseId={patient.id}
              user={user}
              onNavigate={onNavigate}
              embedded
            />
          )}

          {tab === "Appointments" && (
            <Card title="Appointments">
              <DataTable
                rows={appointments}
                columns={[
                  [
                    "Appointment",
                    (item) =>
                      item.title ??
                      item.type ??
                      "Appointment",
                  ],
                  [
                    "Date",
                    (item) =>
                      formattedDate(
                        item.scheduled_at ??
                        item.appointment_date ??
                        item.date
                      ),
                  ],
                  [
                    "Provider",
                    (item) => text(item.provider),
                  ],
                  [
                    "Status",
                    (item) => text(item.status),
                  ],
                ]}
              />
            </Card>
          )}

          {tab === "Referrals" && (
            <Card title="Referrals">
              <DataTable
                rows={referrals}
                columns={[
                  [
                    "Specialty",
                    (item) => text(item.specialty),
                  ],
                  [
                    "Reason",
                    (item) => text(item.reason),
                  ],
                  [
                    "Status",
                    (item) => text(item.status),
                  ],
                  [
                    "Date",
                    (item) =>
                      formattedDate(
                        item.created_at ??
                        item.date
                      ),
                  ],
                ]}
              />
            </Card>
          )}
        </main>
      </div>

      <style>{`
        .patient-nav-button:hover:not([aria-current="page"]) {
          background: #e7f6f1 !important;
          color: #128b73 !important;
          border-color: #b5e4d6 !important;
        }

        .patient-nav-button:focus-visible {
          outline: 2px solid #16a78b;
          outline-offset: 2px;
        }

        @media (max-width: 750px) {
          .patient-workspace {
            grid-template-columns: 1fr !important;
          }

          .patient-workspace nav {
            flex-direction: row !important;
            flex-wrap: wrap;
          }

          .patient-workspace nav button {
            width: auto !important;
            flex: 1 1 auto;
          }
        }
      `}</style>
    </div>
  );
}