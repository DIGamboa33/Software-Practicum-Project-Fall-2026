
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PharmacyNotesPage from "./PharmacyNotesPage";
import {
  fetchStudentCases,
  fetchStudentPharmacyNotes,
  updateStudentCaseStatus,
} from "../lib/api";

const TABS = [
  "Overview",
  "Medications",
  "Labs",
  "Notes",
  "Appointments",
  "Referrals",
];

const STATUSES = [
  "Scheduled",
  "Checked in",
  "Roomed",
  "In progress",
  "Checked out",
];

const ACTIONS = {
  Scheduled: "Check In",
  "Checked in": "Mark as Roomed",
  Roomed: "Start Encounter",
  "In progress": "Check Out",
};

const MINT = "#78e3d1";

function display(value) {
  return value == null || value === ""
    ? "Not recorded"
    : String(value);
}

function formatDate(value) {
  if (!value) return "Not recorded";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString();
}

function sortRecent(items, keys) {
  if (!Array.isArray(items)) return [];

  const getTime = (item) => {
    const value = keys.map((key) => item?.[key]).find(Boolean);
    return new Date(value || 0).getTime() || 0;
  };

  return [...items].sort((a, b) => getTime(b) - getTime(a));
}

function Value({ value }) {
  if (value == null || value === "") return "Not recorded";

  if (Array.isArray(value)) {
    if (!value.length) return "Not recorded";

    return (
      <ul>
        {value.map((item, index) => (
          <li key={item?.id ?? index}>
            <Value value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    return (
      <dl>
        {Object.entries(value)
          .filter(
            ([key]) =>
              !["id", "patient_id", "profile_id"].includes(key)
          )
          .map(([key, item]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>
                <Value value={item} />
              </dd>
            </div>
          ))}
      </dl>
    );
  }

  return String(value);
}

function Card({ title, action, fullWidth = false, children }) {
  return (
    <section
      className="panel data-panel case-section"
      style={{
        gridColumn: fullWidth ? "1 / -1" : undefined,
        minWidth: 0,
      }}
    >
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
      <dd>
        <Value value={value} />
      </dd>
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
            {columns.map(([label]) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={item.id ?? index}>
              {columns.map(([label, render]) => (
                <td key={label}>{render(item)}</td>
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
        if (caseId == null) {
          throw new Error("No case selected.");
        }

        const result = await fetchStudentCases();
        const cases = Array.isArray(result)
          ? result
          : result?.cases ?? [];

        const selected = cases.find(
          (item) =>
            String(item.id) === String(caseId) ||
            String(item.assignment_id) === String(caseId)
        );

        if (!selected) throw new Error("Case not found.");

        if (active) setPatient(selected);
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load patient.");
        }
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
    const assignmentId = patient?.assignment_id;

    if (!assignmentId) {
      setNoteCount(0);
      return;
    }

    let active = true;

    async function loadNoteCount() {
      try {
        const result =
          await fetchStudentPharmacyNotes(assignmentId);

        const notes = Array.isArray(result)
          ? result
          : result?.notes ?? [];

        if (active) setNoteCount(notes.length);
      } catch (err) {
        console.error("Unable to load notes:", err);
        if (active) setNoteCount(0);
      }
    }

    loadNoteCount();
    window.addEventListener("focus", loadNoteCount);
    window.addEventListener("notes-updated", loadNoteCount);

    return () => {
      active = false;
      window.removeEventListener("focus", loadNoteCount);
      window.removeEventListener("notes-updated", loadNoteCount);
    };
  }, [patient?.assignment_id, tab]);

  async function advanceStatus() {
    const current =
      patient?.encounter_status ??
      patient?.starting_encounter_status ??
      "Scheduled";

    const index = STATUSES.indexOf(current);

    if (
      updating ||
      index < 0 ||
      index === STATUSES.length - 1
    ) {
      return;
    }

    setUpdating(true);
    setError("");

    try {
      const next = STATUSES[index + 1];

      await updateStudentCaseStatus(
        patient.assignment_id,
        next
      );

      setPatient((previous) => ({
        ...previous,
        encounter_status: next,
      }));
    } catch (err) {
      setError(
        err.message || "Unable to update encounter status."
      );
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page content-page">
        <p role="status">Loading patient record...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="dashboard-page content-page">
        <p role="alert">{error || "Case not found."}</p>
        <button
          type="button"
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

  const labs = sortRecent(patient.labs, [
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
    ? sortRecent(patient.vitals, [
        "recorded_at",
        "measured_at",
        "date",
      ])[0]
    : patient.vitals ?? patient.current_vitals;

  const allergies = patient.allergies;
  const medicalHistory =
    patient.medical_history ?? patient.history;

  const categorizedAllergies =
    allergies &&
    !Array.isArray(allergies) &&
    typeof allergies === "object";

  const allergyGroups = {
    Medication:
      patient.medication_allergies ??
      (categorizedAllergies
        ? allergies.medication ?? allergies.medications
        : null),
    Food:
      patient.food_allergies ??
      (categorizedAllergies ? allergies.food : null),
    Environmental:
      patient.environmental_allergies ??
      (categorizedAllergies ? allergies.environmental : null),
  };

  const hasAllergyGroups = Object.values(allergyGroups).some(
    (value) => value != null
  );

  const nextAppointment =
    [...appointments]
      .filter((item) => {
        const date = new Date(
          item.scheduled_at ??
            item.appointment_date ??
            item.date
        ).getTime();

        return (
          date >= Date.now() &&
          !["cancelled", "canceled"].includes(
            String(item.status || "").toLowerCase()
          )
        );
      })
      .sort(
        (a, b) =>
          new Date(
            a.scheduled_at ?? a.appointment_date ?? a.date
          ) -
          new Date(
            b.scheduled_at ?? b.appointment_date ?? b.date
          )
      )[0] ?? patient.next_appointment;

  const vitalFields = [
    [
      "Blood Pressure",
      vitals?.blood_pressure ??
        (vitals?.systolic != null &&
        vitals?.diastolic != null
          ? `${vitals.systolic}/${vitals.diastolic} mmHg`
          : null),
    ],
    ["Heart Rate", vitals?.heart_rate ?? vitals?.pulse],
    ["Temperature", vitals?.temperature],
    [
      "Respiratory Rate",
      vitals?.respiratory_rate ?? vitals?.respirations,
    ],
    [
      "Oxygen Saturation",
      vitals?.spo2 ?? vitals?.oxygen_saturation,
    ],
    [
      "Weight",
      vitals?.weight_lbs != null
        ? `${vitals.weight_lbs} lbs`
        : vitals?.weight,
    ],
    [
      "Blood Glucose",
      vitals?.blood_glucose_mg_dl != null
        ? `${vitals.blood_glucose_mg_dl} mg/dL`
        : vitals?.blood_glucose,
    ],
  ];

  const viewAll = (target) => (
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
          flexWrap: "wrap",
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
            {patient.title}
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
                collapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
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
            {TABS.map((item) => (
              <button
                key={item}
                type="button"
                className="patient-nav-button"
                aria-current={
                  tab === item ? "page" : undefined
                }
                title={item}
                onClick={() => setTab(item)}
                style={{
                  width: "100%",
                  padding: "11px 8px",
                  textAlign: collapsed ? "center" : "left",
                  border: `1px solid ${
                    tab === item ? MINT : "#e5e9f0"
                  }`,
                  borderRadius: 9,
                  background:
                    tab === item ? MINT : "#f7f9fc",
                  color:
                    tab === item ? "#183b43" : "#53627b",
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
            <div
              style={{
                flex: "1 1 200px",
                minWidth: 0,
              }}
            >
              <p
                className="section-label"
                style={{
                  margin: "0 0 4px",
                  fontSize: 11,
                }}
              >
                Chief Complaint
              </p>
              <strong style={{ fontSize: 13 }}>
                {display(patient.chief_complaint)}
              </strong>
            </div>

            <div style={{ minWidth: 110 }}>
              <p
                className="section-label"
                style={{
                  margin: "0 0 4px",
                  fontSize: 11,
                }}
              >
                Encounter Status
              </p>
              <span className="status-badge">
                {encounter}
              </span>
            </div>

            {ACTIONS[encounter] && (
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
                {updating
                  ? "Updating..."
                  : ACTIONS[encounter]}
              </button>
            )}
          </section>

          {tab === "Overview" && (
            <>
              <div
                className="case-section-heading"
                style={{ marginBottom: 12 }}
              >
                <h2 style={{ margin: 0 }}>
                  Patient Overview
                </h2>
              </div>

              <div className="clinical-summary-grid">
                <Card title="Demographics">
                  <dl className="detail-form-grid">
                    <Row
                      label="Age"
                      value={patient.patient_age}
                    />
                    <Row
                      label="Sex"
                      value={patient.patient_sex}
                    />
                    <Row
                      label="Date of Birth"
                      value={
                        patient.date_of_birth ?? patient.dob
                      }
                    />
                  </dl>
                </Card>

                <Card title="Contact Information">
                  <dl className="detail-form-grid">
                    <Row
                      label="Phone"
                      value={
                        patient.phone ?? patient.phone_number
                      }
                    />
                    <Row
                      label="Address"
                      value={patient.address}
                    />
                    <Row
                      label="Careflow ID"
                      value={
                        patient.careflow_id ??
                        patient.careflowId
                      }
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

                <Card
                  title="Medical History & Diagnoses"
                  fullWidth
                >
                  <div className="medical-history-grid">
                    <div>
                      <h3 className="clinical-subheading">
                        Medical History
                      </h3>
                      <Value value={medicalHistory} />
                    </div>

                    <div>
                      <h3 className="clinical-subheading">
                        Diagnoses
                      </h3>
                      <Value
                        value={
                          patient.diagnoses ??
                          patient.diagnosis
                        }
                      />
                    </div>

                    <div>
                      <h3 className="clinical-subheading">
                        Surgical History
                      </h3>
                      <Value
                        value={patient.surgical_history}
                      />
                    </div>
                  </div>
                </Card>

                <Card title="Allergies">
                  {hasAllergyGroups ? (
                    <dl className="detail-form-grid">
                      {Object.entries(allergyGroups).map(
                        ([label, value]) => (
                          <Row
                            key={label}
                            label={label}
                            value={value}
                          />
                        )
                      )}
                    </dl>
                  ) : (
                    <Value value={allergies} />
                  )}
                </Card>

                <Card
                  title="Current Medications"
                  action={viewAll("Medications")}
                >
                  <Value value={patient.medications} />
                </Card>

                <Card title="Current Vitals">
                  {vitals ? (
                    <>
                      <dl className="detail-form-grid">
                        {vitalFields.map(([label, value]) => (
                          <Row
                            key={label}
                            label={label}
                            value={value}
                          />
                        ))}
                      </dl>
                      <p className="case-help-text">
                        Last recorded:{" "}
                        {formatDate(
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
                  action={viewAll("Labs")}
                >
                  {labs.length ? (
                    <dl className="detail-form-grid">
                      {labs.slice(0, 5).map((lab, index) => (
                        <Row
                          key={lab.id ?? index}
                          label={
                            lab.test_name ?? lab.name ?? "Lab"
                          }
                          value={`${display(
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
                    <dl>
                      <Row
                        label="Existing Clinical Results"
                        value={patient.results}
                      />
                    </dl>
                  )}
                </Card>

                <Card title="Care Team">
                  <Value
                    value={
                      patient.care_team ?? patient.careTeam
                    }
                  />
                </Card>

                <Card
                  title="Next Appointment"
                  action={viewAll("Appointments")}
                >
                  {nextAppointment ? (
                    typeof nextAppointment === "object" ? (
                      <dl className="detail-form-grid">
                        <Row
                          label="Appointment"
                          value={
                            nextAppointment.title ??
                            nextAppointment.type ??
                            nextAppointment.reason ??
                            "Appointment"
                          }
                        />
                        <Row
                          label="Date"
                          value={formatDate(
                            nextAppointment.scheduled_at ??
                              nextAppointment.appointment_date ??
                              nextAppointment.date
                          )}
                        />
                        <Row
                          label="Reason"
                          value={nextAppointment.reason}
                        />
                        <Row
                          label="Location"
                          value={nextAppointment.location}
                        />
                        <Row
                          label="Status"
                          value={nextAppointment.status}
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

                <Card title="Clinical Updates">
                  <Value
                    value={
                      patient.clinical_updates ??
                      patient.clinicalUpdates
                    }
                  />
                </Card>

                <Card
                  title="Referrals"
                  action={viewAll("Referrals")}
                >
                  {referrals.length ? (
                    <dl className="detail-form-grid">
                      {referrals
                        .slice(0, 3)
                        .map((referral, index) => (
                          <Row
                            key={referral.id ?? index}
                            label={
                              referral.specialty ?? "Referral"
                            }
                            value={
                              referral.reason ??
                              referral.status
                            }
                          />
                        ))}
                    </dl>
                  ) : (
                    <p className="case-help-text">
                      No referrals recorded.
                    </p>
                  )}
                </Card>
              </div>
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
                      item.test_name ?? item.name ?? "Lab",
                  ],
                  [
                    "Result",
                    (item) =>
                      `${display(
                        item.result ?? item.value
                      )} ${item.unit || ""}`,
                  ],
                  [
                    "Reference Range",
                    (item) =>
                      display(item.reference_range),
                  ],
                  [
                    "Date",
                    (item) =>
                      formatDate(
                        item.collected_at ??
                          item.recorded_at ??
                          item.date
                      ),
                  ],
                ]}
              />
              {patient.results && (
                <dl>
                  <Row
                    label="Existing Clinical Results"
                    value={patient.results}
                  />
                </dl>
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
                      item.reason ??
                      "Appointment",
                  ],
                  [
                    "Date",
                    (item) =>
                      formatDate(
                        item.scheduled_at ??
                          item.appointment_date ??
                          item.date
                      ),
                  ],
                  [
                    "Reason",
                    (item) => display(item.reason),
                  ],
                  [
                    "Location",
                    (item) => display(item.location),
                  ],
                  [
                    "Provider",
                    (item) => display(item.provider),
                  ],
                  [
                    "Status",
                    (item) => display(item.status),
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
                    (item) => display(item.specialty),
                  ],
                  [
                    "Reason",
                    (item) => display(item.reason),
                  ],
                  [
                    "Status",
                    (item) => display(item.status),
                  ],
                  [
                    "Date",
                    (item) =>
                      formatDate(
                        item.created_at ?? item.date
                      ),
                  ],
                ]}
              />
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
