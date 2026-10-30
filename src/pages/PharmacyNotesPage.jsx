import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchStudentCases,
  fetchStudentPharmacyNotes,
  saveStudentNote,
  updateStudentNote,
  submitStudentPharmacyNote,
  deleteStudentPharmacyNote,
} from "../lib/api";

const INSTRUCTORS = [
  { id: "demo-rivera", name: "Dr. Rivera" },
  { id: "demo-instructor", name: "Demo Instructor" },
];

const ICD = [
  ["I10", "Essential (primary) hypertension"],
  ["E11.9", "Type 2 diabetes mellitus without complications"],
  ["E78.5", "Hyperlipidemia, unspecified"],
  ["J45.909", "Unspecified asthma, uncomplicated"],
  ["I50.9", "Heart failure, unspecified"],
  ["K21.9", "Gastro-esophageal reflux disease without esophagitis"],
  ["E03.9", "Hypothyroidism, unspecified"],
  ["F32.A", "Depression, unspecified"],
  ["N18.9", "Chronic kidney disease, unspecified"],
  ["R42", "Dizziness and giddiness"],
];

const CPT = ["99211", "99212", "99213", "99214", "99215"].map(
  (code, index) => [
    code,
    `Established patient office visit — level ${index + 1}`,
  ]
);

const TEMPLATES = {
  pharmacy_soap: {
    label: "SOAP (Ambulatory Care)",
    sections: [
      ["Subjective", [
        ["hpi", "History of Present Illness / OLDCARTS"],
        ["ros", "Review of Systems"],
        ["homeMonitoring", "Home Monitoring / Patient-Reported Readings"],
        ["adherence", "Medication Adherence / Missed Doses"],
        ["sideEffects", "Medication Side Effects / Tolerability"],
        ["barriers", "Medication Access / Affordability Barriers"],
        ["socialHistory", "Family, Social, and Lifestyle History"],
      ]],
      ["Objective", [
        ["exam", "Physical Examination / Clinical Findings"],
        ["labs", "Laboratory Results and Trends"],
        ["diagnostics", "Other Diagnostic Results"],
      ]],
      ["Assessment", [
        ["clinicalReasoning", "Overall Clinical Assessment"],
      ]],
      ["Plan", [
        ["education", "Patient Education / Counseling"],
        ["lifestylePlan", "Lifestyle Recommendations"],
        ["generalFollowUp", "General Follow-up / Disposition"],
      ]],
    ],
  },
  pharmacy_sbar: {
    label: "SBAR (Inpatient)",
    sections: [
      ["Situation", [
        ["situation", "Current Situation / Reason for Communication"],
        ["concern", "Immediate Clinical Concern"],
        ["urgency", "Urgency / Priority"],
      ]],
      ["Background", [
        ["background", "Relevant Medical / Admission History"],
        ["medications", "Relevant Medication History"],
        ["labs", "Relevant Labs / Clinical Results"],
      ]],
      ["Assessment", [
        ["assessment", "Clinical Assessment"],
        ["medicationSafety", "Medication Safety Concerns"],
      ]],
      ["Recommendation", [
        ["recommendation", "Recommended Actions"],
        ["monitoring", "Monitoring / Follow-up"],
        ["response", "Provider Response / Outcome"],
      ]],
    ],
  },
};

const VITALS = [
  ["systolic", "Systolic BP (mmHg)"],
  ["diastolic", "Diastolic BP (mmHg)"],
  ["pulse", "Heart Rate (bpm)"],
  ["respirations", "Respiratory Rate (/min)"],
  ["temperature", "Temperature (°C)"],
  ["spo2", "SpO₂ (%)"],
  ["height", "Height (cm)"],
  ["weight", "Weight (kg)"],
];

const PROBLEM = [
  ["name", "Diagnosis / Clinical Problem"],
  ["icd10", "ICD-10 Code"],
  ["status", "Problem Status / Priority"],
  ["evidence", "Supporting Clinical Evidence"],
  ["reasoning", "Clinical Rationale"],
  ["goal", "Treatment Goal"],
];

const PLAN = [
  ["medications", "Medication Recommendations"],
  ["tests", "Laboratory Tests / Orders"],
  ["monitoring", "Monitoring / Safety Parameters"],
  ["counseling", "Patient Counseling"],
  ["referrals", "Referrals"],
  ["followUp", "Follow-up / Reassessment"],
];

const MEDICATION = [
  ["name", "Medication Name"],
  ["dose", "Dose"],
  ["route", "Route"],
  ["frequency", "Frequency"],
  ["adherence", "How Taken / Adherence"],
  ["issues", "Side Effects / Access Issues"],
];

const uid = () => crypto.randomUUID();

const blank = (fields) => ({
  id: uid(),
  ...Object.fromEntries(fields.map(([key]) => [key, ""])),
});

function mapDatabaseNote(note) {
  const stored = note.content && typeof note.content === "object" ? note.content : {};
  return {
    id: note.id,
    title: note.title || stored.title || "Untitled Note",
    type: note.note_type || stored.type || "pharmacy_soap",
    status: note.status || "Draft",
    content: stored.content && typeof stored.content === "object" ? stored.content : stored,
    vitals: stored.vitals || {},
    problems: Array.isArray(stored.problems) ? stored.problems : [],
    medications: Array.isArray(stored.medications) ? stored.medications : [],
    instructorId: stored.instructorId || "",
    instructorName: stored.instructorName || "",
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    submittedAt: note.submitted_at || stored.submittedAt || null,
    feedback: note.feedback || null,
    fromDatabase: true,
  };
}

const shown = (value) => {
  if (value == null || value === "") return "Not provided";
  if (Array.isArray(value)) return value.map(shown).join(", ") || "Not provided";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleString() : "—";

const locked = (note) =>
  ["Pending Review", "Submitted", "Approved", "Signed"].includes(note?.status);

const row = {
  display: "flex",
  gap: ".75rem",
  flexWrap: "wrap",
  alignItems: "center",
};

const box = { padding: "1rem", marginBottom: "1rem" };

const modal = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "#0009",
  display: "grid",
  placeItems: "center",
  padding: "1rem",
};

function Field({ label, value, change, type = "textarea", options, disabled }) {
  return (
    <label className="detail-field" style={{ display: "block", marginBottom: "1rem" }}>
      <span style={{ display: "block", marginBottom: 6 }}>{label}</span>

      {options ? (
        <select
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
        >
          {options.map((option) => {
            const item = typeof option === "string"
              ? { value: option, label: option }
              : option;

            return (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            );
          })}
        </select>
      ) : type === "textarea" ? (
        <textarea
          rows={3}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      ) : (
        <input
          type={type}
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => change(e.target.value)}
        />
      )}
    </label>
  );
}

function Search({ label, codes, value, onPick, disabled }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const item = codes.find(([code]) => code === value);
    setQuery(item ? item.join(" — ") : value || "");
  }, [value, codes]);

  const results = codes.filter(([code, description]) =>
    `${code} ${description}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ position: "relative", marginBottom: "1rem" }}>
      <Field
        label={label}
        type="text"
        value={query}
        disabled={disabled}
        change={(value) => {
          setQuery(value);
          setOpen(true);
        }}
      />

      {!disabled && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide Results" : "Search"}
        </button>
      )}

      {open && !disabled && (
        <div
          className="panel"
          style={{
            ...box,
            position: "absolute",
            zIndex: 5,
            width: "100%",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {results.map(([code, description]) => (
            <button
              key={code}
              type="button"
              className="secondary-button"
              style={{ display: "block", width: "100%", textAlign: "left" }}
              onClick={() => {
                onPick(code, description);
                setOpen(false);
              }}
            >
              {code} — {description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Details({ items }) {
  return items.map(([label, value]) => (
    <p key={label}>
      <strong>{label}:</strong> {shown(value)}
    </p>
  ));
}

export default function PharmacyNotesPage({
  onNavigate,
  user,
  selectedCaseId,
  embedded = false,
}) {
  const [params] = useSearchParams();
  const caseId = selectedCaseId ?? params.get("id") ?? params.get("caseId");

  const [patient, setPatient] = useState(null);
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState(0);
  const [editor, setEditor] = useState(null);
  const [showPatient, setShowPatient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notesLoading, setNotesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const saved = notes.find((note) => note.id === draft?.id);
  const readOnly = locked(draft);
  const template = TEMPLATES[draft?.type] || TEMPLATES.pharmacy_soap;
  const [sectionName, sectionFields] = template.sections[tab] || template.sections[0];

  const soap = draft?.type === "pharmacy_soap";
  const content = draft?.content || {};
  const vitals = draft?.vitals || {};
  const problems = draft?.problems || [];
  const medications = draft?.medications || [];

  const bmi = +vitals.height > 0 && +vitals.weight > 0
    ? (+vitals.weight / (+vitals.height / 100) ** 2).toFixed(1)
    : "";

  const chart = [
    ["Chief Complaint", patient?.chief_complaint],
    ["Medical / Surgical History", patient?.history],
    ["Chart Diagnoses", patient?.diagnoses ?? patient?.diagnosis],
    ["Current Medications", patient?.medications],
    ["Allergies", patient?.allergies],
  ];

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setPatient(null);

      try {
        if (!caseId) throw new Error("No case selected.");

        const result = await fetchStudentCases();
        const cases = Array.isArray(result) ? result : result?.cases || [];

        const found = cases.find(
          (item) => String(item.id) === String(caseId)
        ) || cases.find(
          (item) => String(item.assignment_id) === String(caseId)
        );

        if (!found) throw new Error("Case not found.");
        if (active) setPatient(found);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [caseId]);

  useEffect(() => {
    if (!patient?.assignment_id) {
      setNotes([]);
      setDraft(null);
      return;
    }

    let active = true;
    async function loadNotes() {
      setNotesLoading(true);
      setError("");
      setDraft(null);
      setEditor(null);
      try {
        const records = await fetchStudentPharmacyNotes(patient.assignment_id);
        if (active) setNotes(records.map(mapDatabaseNote));
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load Pharmacy notes.");
          setNotes([]);
        }
      } finally {
        if (active) setNotesLoading(false);
      }
    }
    loadNotes();
    return () => { active = false; };
  }, [patient?.assignment_id]);

  async function persist(note, close = false) {
    if (!patient?.assignment_id || !note || saving || locked(note)) return false;
    if (editor) {
      setError("Save or cancel the open editor first.");
      return false;
    }

    setSaving(true);
    setError("");
    try {
      const title = note.title?.trim() || TEMPLATES[note.type]?.label || "Untitled Note";
      const noteContent = {
        content: note.content || {},
        vitals: note.vitals || {},
        problems: note.problems || [],
        medications: note.medications || [],
      };
      const record = note.fromDatabase
        ? await updateStudentNote(note.id, { title, content: noteContent })
        : await saveStudentNote({
            assignmentId: patient.assignment_id,
            discipline: "Pharmacy",
            noteType: note.type,
            title,
            content: noteContent,
          });
      const updated = mapDatabaseNote(record);
      setNotes((current) => [updated, ...current.filter((item) => String(item.id) !== String(updated.id))]);
      setDraft(close ? null : updated);
      setMessage("Draft saved to database.");
      return true;
    } catch (err) {
      setError(err.message || "Unable to save note.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submitNote() {
  if (!draft?.fromDatabase || !draft?.id) {
    setError("Save this note before submitting.");
    return;
  }

  if (draft.dirty) {
    setError("Save your latest changes before submitting.");
    return;
  }

  if (editor) {
    setError("Save or cancel the open editor first.");
    return;
  }

  if (!["Draft", "Returned"].includes(draft.status)) {
    setError("This note cannot be submitted.");
    return;
  }

  if (saving || submitting) return;

  const confirmed = window.confirm(
    "Submit this note for instructor review? You will not be able to edit it until your instructor returns it."
  );

  if (!confirmed) return;

  setSubmitting(true);
  setError("");
  setMessage("");

  try {
    const result = await submitStudentPharmacyNote(draft.id);

    const updated = mapDatabaseNote(result.note);

    setNotes((current) =>
      current.map((note) =>
        String(note.id) === String(updated.id) ? updated : note
      )
    );

    setDraft(updated);
    setMessage("Note submitted for instructor review.");
  } catch (err) {
    setError(err.message || "Unable to submit note.");
  } finally {
    setSubmitting(false);
  }
}

async function deleteDraft(note) {
  if (!note || saving || deleting) return;

  // Only drafts can be deleted.
  if (note.status !== "Draft") {
    setError("Only draft notes can be deleted.");
    return;
  }

  const confirmed = window.confirm(
    `Permanently delete "${note.title || "Untitled Note"}"? This cannot be undone.`
  );

  if (!confirmed) return;

  // New notes that have never been saved only exist in React state.
  if (!note.fromDatabase) {
    setNotes((current) =>
      current.filter((item) => String(item.id) !== String(note.id))
    );

    if (String(draft?.id) === String(note.id)) {
      setDraft(null);
      setEditor(null);
    }

    setMessage("Unsaved draft discarded.");
    return;
  }

  setDeleting(true);
  setError("");
  setMessage("");

  try {
    await deleteStudentPharmacyNote(note.id);

    // Remove the deleted note from the list.
    setNotes((current) =>
      current.filter((item) => String(item.id) !== String(note.id))
    );

    // Close the editor if this was the open note.
    if (String(draft?.id) === String(note.id)) {
      setDraft(null);
      setEditor(null);
    }

    setMessage("Draft deleted successfully.");
  } catch (err) {
    setError(err.message || "Unable to delete draft.");
  } finally {
    setDeleting(false);
  }
}

  function update(patch) {
    if (readOnly || !draft || saving) return;
    setDraft((current) => current ? { ...current, ...patch, dirty: true } : current);
    setMessage("Unsaved changes");
  }

  const contentField = (field, value) =>
    update({ content: { ...content, [field]: value } });

  const vitalField = (field, value) =>
    update({ vitals: { ...vitals, [field]: value } });

  const fields = (list, values, change, disabled = readOnly) =>
    list.map(([key, label]) => (
      <Field
        key={key}
        label={label}
        value={values[key]}
        disabled={disabled}
        change={(value) => change(key, value)}
      />
    ));

  function open(note) {
    if (editor && !window.confirm("Discard open editor changes?")) return;

    setDraft(note ? {
      ...note,
      content: note.content || {},
      vitals: note.vitals || {},
      problems: note.problems || [],
      medications: note.medications || [],
    } : {
      id: uid(),
      fromDatabase: false,
      title: "",
      type: "pharmacy_soap",
      status: "Draft",
      content: {},
      vitals: {},
      problems: [],
      medications: [],
    });

    setEditor(null);
    setTab(0);
    setMessage("");
  }

  function saveEntry() {
    if (!editor || readOnly) return;

    const { kind, value } = editor;
    const items = draft[kind] || [];

    const next = items.some((item) => item.id === value.id)
      ? items.map((item) => item.id === value.id ? value : item)
      : [...items, value];

    update({ [kind]: next });
    setEditor(null);
  }

  function removeEntry(kind, id) {
    if (!window.confirm(`Remove this ${kind.slice(0, -1)}?`)) return;

    update({ [kind]: draft[kind].filter((item) => item.id !== id) });
  }

  function listEntries(kind, list, fieldList) {
    const isProblem = kind === "problems";
    const title = isProblem ? "Clinical Problems" : "Medication Reconciliation / Review";
    const singular = isProblem ? "Problem" : "Medication";

    return (
      <div style={{ marginTop: "1rem" }}>
        <div className="case-section-heading">
          <h4>{title}</h4>

          {!readOnly && !editor && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditor({
                kind,
                value: blank(isProblem ? [...PROBLEM, ...PLAN] : MEDICATION),
              })}
            >
              + Add {singular}
            </button>
          )}
        </div>

        {!list.length && <p>No {kind} added yet.</p>}

        {list.map((item, index) => (
          <div key={item.id} className="panel" style={box}>
            <h4>{index + 1}. {item.name || "Untitled"}</h4>

            <Details items={fieldList.map(([key, label]) => [label, item[key]])} />

            {!readOnly && !editor && (
              <div style={row}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditor({ kind, value: { ...item } })}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => removeEntry(kind, item.id)}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}

        {editor?.kind === kind && (
          <div className="panel" style={box}>
            <h4>{singular}</h4>

            {isProblem && (
              <Search
                label="Search ICD-10 Diagnosis"
                codes={ICD}
                value={editor.value.icd10}
                onPick={(code, description) =>
                  setEditor((current) => ({
                    ...current,
                    value: { ...current.value, name: description, icd10: code },
                  }))
                }
              />
            )}

            {fields(
              fieldList,
              editor.value,
              (key, value) => setEditor((current) => ({
                ...current,
                value: { ...current.value, [key]: value },
              })),
              false
            )}

            <div style={row}>
              <button type="button" className="primary-button" onClick={saveEntry}>
                Save {singular}
              </button>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={embedded ? "" : "dashboard-page content-page"}>
        Loading notes...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className={embedded ? "" : "dashboard-page content-page"}>
        <p role="alert">{error || "Case not found."}</p>

        {!embedded && (
          <button
            className="secondary-button"
            onClick={() => onNavigate?.("overview")}
          >
            Back to My Cases
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? "pharmacy-notes-embedded" : "dashboard-page content-page"}>
      {!embedded && (
        <section className="page-heading">
          <div>
            <p className="section-label">Student Documentation</p>
            <h1>Pharmacy Notes</h1>
            <p>{patient.patient_name} · {patient.title}</p>
          </div>

          <div style={row}>
            <button
              className="secondary-button"
              onClick={() => setShowPatient(true)}
            >
              Patient Information
            </button>

            <button
              className="secondary-button"
              onClick={() => onNavigate?.("caseDetail", { caseId })}
            >
              Back to Case
            </button>
          </div>
        </section>
      )}

      {error && <p role="alert">{error}</p>}

      {!draft ? (
        <section className="panel data-panel">
          <div className="case-section-heading">
            <h2>Existing Notes</h2>

            <button className="primary-button" onClick={() => open(null)}>
              + New Note
            </button>
          </div>

          {notesLoading ? (
            <p>Loading Pharmacy notes...</p>
          ) : !notes.length ? (
            <p>No notes created yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {["Title", "Note Type", "Updated", "Status", "Instructor", "Action"].map(
                      (heading) => <th key={heading}>{heading}</th>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {notes.map((note) => (
                    <tr key={`${note.fromDatabase ? "db" : "local"}-${note.id}`}>
                      <td>{note.title}</td>
                      <td>{TEMPLATES[note.type]?.label || note.type}</td>
                      <td>{formatDate(note.updatedAt)}</td>
                      <td>{note.status || "Draft"}</td>
                      <td>{note.instructorName || "—"}</td>
                      <td>
                        <button
                          className="secondary-button"
                          onClick={() => open(note)}
                        >
                          {locked(note) ? "View" : "Continue"}
                        </button>

                        {note.status === "Draft" && (
                          <button
                            type="button"
                            className="secondary-button"
                            style={{
                              marginLeft: "8px",
                              color: "#dc2626",
                              borderColor: "#dc2626",
                            }}
                            disabled={saving || deleting}
                            onClick={() => deleteDraft(note)}
                          >
                            {deleting ? "Deleting..." : "Delete"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="panel data-panel">
          <div className="case-section-heading">
            <div>
              <h2>{readOnly ? "View Note" : saved ? "Edit Note" : "New Note"}</h2>
              <small role="status">{message}</small>
            </div>

            <button
              className="secondary-button"
              onClick={() => {
                if ((!draft.dirty || window.confirm("Discard unsaved changes?")) && (!editor || window.confirm("Discard open editor changes?"))) {
                  setDraft(null);
                  setEditor(null);
                }
              }}
            >
              Back to Notes
            </button>
          </div>

          <div className="detail-form-grid">
            <Field
              label="Note Title"
              type="text"
              value={draft.title}
              disabled={readOnly}
              change={(title) => update({ title })}
            />

            <Field
              label="Note Type"
              value={draft.type}
              disabled={readOnly}
              options={Object.entries(TEMPLATES).map(([value, item]) => ({
                value,
                label: item.label,
              }))}
              change={(type) => {
                if (type === draft.type) return;

                update({
                  type,
                  content: {},
                  vitals: {},
                  problems: [],
                  medications: [],
                });

                setTab(0);
                setEditor(null);
              }}
            />
          </div>

          <p>
            <strong>Patient:</strong> {patient.patient_name} ·{" "}
            <strong>Author:</strong>{" "}
            {user?.full_name || user?.name || "Current Student"}
          </p>

          <p>
            <strong>Status:</strong> {draft.status || "Draft"}
            {draft.instructorName && ` · Instructor: ${draft.instructorName}`}
            {draft.submittedAt && ` · Submitted: ${formatDate(draft.submittedAt)}`}
          </p>

          {draft.feedback && (
            <div className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h3>Instructor Feedback</h3>

              <p>
                <strong>Decision:</strong>{" "}
                {draft.feedback.decision || "Not provided"}
              </p>

              <p>
                <strong>Comments:</strong>{" "}
                {draft.feedback.comments || "No comments provided."}
              </p>

              <p>
                <strong>Reviewed:</strong>{" "}
                {formatDate(draft.feedback.created_at)}
              </p>
            </div>
          )}

          {readOnly && (
            <p>This note is read-only while its status is <strong>{draft.status}</strong>.</p>
          )}

          <nav aria-label="Note sections" style={row}>
            {template.sections.map(([name], index) => (
              <button
                key={name}
                type="button"
                className={tab === index ? "primary-button" : "secondary-button"}
                onClick={() => {
                  setEditor(null);
                  setTab(index);
                }}
              >
                {name}
              </button>
            ))}
          </nav>

          <div
            key={`${draft.type}-${tab}`}
            style={{
              height: "min(60vh, 550px)",
              minHeight: 280,
              overflowY: "auto",
              padding: "1.5rem",
              marginTop: "1rem",
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            <h3>{sectionName}</h3>

            {soap && tab === 0 && (
              <>
                <div className="panel" style={box}>
                  <h4>Patient Chart (Read-only)</h4>
                  <Details items={chart} />
                </div>

                {listEntries("medications", medications, MEDICATION)}
                <h4>Patient-Reported Information</h4>
              </>
            )}

            {soap && tab === 1 && (
              <div className="panel" style={box}>
                <h4>Vital Signs and Measurements</h4>

                <p>
                  <strong>Existing chart results:</strong>{" "}
                  {shown(patient.results)}
                </p>

                <div className="detail-form-grid">
                  {VITALS.map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      type="number"
                      value={vitals[key]}
                      disabled={readOnly}
                      change={(value) => vitalField(key, value)}
                    />
                  ))}

                  <Field
                    label="BMI (kg/m²)"
                    value={bmi}
                    type="text"
                    disabled
                    change={() => {}}
                  />
                </div>
              </div>
            )}

            {soap && tab === 2 && (
              <>
                <div className="panel" style={box}>
                  <h4>Official Chart Diagnoses (Read-only)</h4>
                  <p>{shown(patient.diagnoses ?? patient.diagnosis)}</p>
                </div>

                {listEntries("problems", problems, PROBLEM)}
              </>
            )}

            {soap && tab === 3 && (
              <>
                <h4>Problem-Oriented Treatment Plans</h4>

                {!problems.length && (
                  <p>Add clinical problems in Assessment first.</p>
                )}

                {problems.map((problem, index) => (
                  <div key={problem.id} className="panel" style={box}>
                    <h4>Problem {index + 1}: {problem.name || "Untitled"}</h4>

                    <p>
                      ICD-10: {shown(problem.icd10)} · Goal: {shown(problem.goal)}
                    </p>

                    {fields(PLAN, problem, (key, value) =>
                      update({
                        problems: problems.map((item) =>
                          item.id === problem.id
                            ? { ...item, [key]: value }
                            : item
                        ),
                      })
                    )}
                  </div>
                ))}

                <div className="panel" style={box}>
                  <h4>Encounter Coding</h4>

                  <Search
                    label="Search CPT Code"
                    codes={CPT}
                    value={content.cpt}
                    disabled={readOnly}
                    onPick={(code) => contentField("cpt", code)}
                  />

                  <Field
                    label="CPT Code"
                    value={content.cpt}
                    disabled={readOnly}
                    options={[
                      { value: "", label: "Select CPT Code" },
                      ...CPT.map(([code]) => code),
                      "Other",
                    ]}
                    change={(value) => contentField("cpt", value)}
                  />

                  {content.cpt === "Other" && (
                    <Field
                      label="Other CPT Code"
                      type="text"
                      value={content.otherCpt}
                      disabled={readOnly}
                      change={(value) => contentField("otherCpt", value)}
                    />
                  )}
                </div>
              </>
            )}

            {!soap && tab === 1 && (
              <div className="panel" style={box}>
                <h4>Patient Chart (Read-only)</h4>
                <Details items={chart} />
              </div>
            )}

            {fields(sectionFields, content, contentField)}

            {!soap && tab === 3 && (
              <div className="panel" style={box}>
                <h4>Communication Details</h4>

                <Field
                  label="Communicated With"
                  type="text"
                  value={content.communicatedWith}
                  disabled={readOnly}
                  change={(value) => contentField("communicatedWith", value)}
                />

                <Field
                  label="Communication Method"
                  value={content.communicationMethod}
                  disabled={readOnly}
                  options={[
                    { value: "", label: "Select Method" },
                    "Phone",
                    "In Person",
                    "Secure Message",
                    "Other",
                  ]}
                  change={(value) => contentField("communicationMethod", value)}
                />

                <Field
                  label="Communication Date / Time"
                  type="datetime-local"
                  value={content.communicationTime}
                  disabled={readOnly}
                  change={(value) => contentField("communicationTime", value)}
                />
              </div>
            )}
          </div>

          <div
            className="form-actions"
            style={{ ...row, justifyContent: "space-between", marginTop: "1.5rem" }}
          >
            <div style={row}>
              <button
                className="secondary-button"
                disabled={!tab}
                onClick={() => {
                  setEditor(null);
                  setTab(tab - 1);
                }}
              >
                Previous
              </button>

              <button
                className="secondary-button"
                disabled={tab === template.sections.length - 1}
                onClick={() => {
                  setEditor(null);
                  setTab(tab + 1);
                }}
              >
                Next
              </button>
            </div>

            <div style={row}>

            {!readOnly && (
              <>
              {draft?.status === "Draft" && (
                <button
                  type="button"
                  className="secondary-button"
                  style={{
                    color: "#dc2626",
                    borderColor: "#dc2626",
                  }}
                  disabled={saving || deleting}
                  onClick={() => deleteDraft(draft)}
                >
                  {deleting ? "Deleting..." : "Delete Draft"}
                </button>
              )}
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving || submitting || notesLoading}
                  onClick={() => persist(draft, false)}
                >
                  {saving ? "Saving..." : "Save Draft"}
                </button>

                {draft.fromDatabase &&
                  ["Draft", "Returned"].includes(draft.status) && (
                    <button
                      type="button"
                      className="primary-button"
                      disabled={
                        saving ||
                        submitting ||
                        notesLoading ||
                        draft.dirty ||
                        Boolean(editor)
                      }
                      onClick={submitNote}
                    >
                      {submitting ? "Submitting..." : "Submit for Review"}
                    </button>
                  )}
              </>
            )}
            </div>
          </div>
        </section>
      )}

      {showPatient && (
        <div
          style={modal}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPatient(false);
          }}
        >
          <section
            className="panel data-panel"
            role="dialog"
            aria-modal="true"
            style={{
              maxWidth: 650,
              maxHeight: "85vh",
              overflowY: "auto",
              width: "100%",
            }}
          >
            <h2>Patient Information</h2>

            <Details items={[
              ["Name", patient.patient_name],
              ["Date of Birth", patient.date_of_birth ?? patient.dob],
              ["MRN", patient.mrn ?? patient.medical_record_number],
              ["Age", patient.patient_age],
              ["Sex", patient.patient_sex],
              ...chart,
              ["Clinical Results", patient.results],
            ]} />

            <button
              className="secondary-button"
              onClick={() => setShowPatient(false)}
            >
              Close
            </button>
          </section>
        </div>
      )}

    </div>
  );
}