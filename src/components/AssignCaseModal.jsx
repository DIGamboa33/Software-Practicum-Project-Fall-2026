import { useEffect, useRef, useState } from "react";
import {
  assignInstructorCase,
  fetchInstructorClassroom,
  fetchInstructorPatientDetails,
  fetchInstructorPatients,
} from "../lib/api";
import { NOTE_TYPES } from "../lib/noteTypes";

const EMPTY_FORM = {
  title: "",
  patientName: "",
  dateOfBirth: "",
  patientSex: "",
  chiefComplaint: "",
  results: "",
  noteType: "soap",
  dueAt: "",
  expectedDiagnoses: "",
  instructorNotes: "",
};

const joinParts = (parts) => parts.filter(Boolean).join(" ");
const medicationText = (item) => joinParts([item.medication_name, item.dosage, item.frequency]);
const allergyText = (item) =>
  joinParts([item.allergen, item.reaction && `- ${item.reaction}`, item.severity && `(${item.severity})`]);
const historyText = (item) => joinParts([item.condition_name, item.status && `(${item.status})`]);

function vitalsText(rows) {
  if (!rows?.length) return "";
  const latest = [...rows].sort((a, b) =>
    String(b.recorded_at || b.created_at || "").localeCompare(
      String(a.recorded_at || a.created_at || ""),
    ),
  )[0];
  return [
    latest.blood_pressure && `BP ${latest.blood_pressure}`,
    latest.heart_rate != null && `HR ${latest.heart_rate} bpm`,
    latest.weight_lbs != null && `Weight ${latest.weight_lbs} lbs`,
    latest.blood_glucose_mg_dl != null && `Glucose ${latest.blood_glucose_mg_dl} mg/dL`,
  ]
    .filter(Boolean)
    .join(", ");
}

function ageFromDob(dob) {
  if (!dob) return "";
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : "";
}

const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);

// One prefilled field the instructor can remove or restore
function Slot({ id, label, removed, onToggle, children }) {
  return (
    <div className={removed ? "admin-form__slot assign-slot--removed" : "admin-form__slot"}>
      <div className="assign-slot__head">
        <label htmlFor={id}>{label}</label>
        <button className="text-button" onClick={onToggle} type="button">
          {removed ? "Restore" : "Remove"}
        </button>
      </div>
      {!removed && children}
    </div>
  );
}

// A list of prefilled items (history, medications, allergies), each removable
const toItems = (texts) =>
  texts.map((text) => ({ id: crypto.randomUUID(), text, hidden: false }));

// Only the items still shown are sent to the case
const visibleTexts = (items) =>
  items.filter((item) => !item.hidden).map((item) => item.text.trim()).filter(Boolean);

// Prefilled items as pills. The x hides one, and hidden pills can be brought back.
function ChipSlot({ label, items, setItems, placeholder }) {
  const [draft, setDraft] = useState("");
  const shown = items.filter((item) => !item.hidden);
  const hidden = items.filter((item) => item.hidden);

  function setHidden(id, value) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, hidden: value } : item)));
  }

  function addDraft() {
    const text = draft.trim();
    if (!text) return;
    setItems((current) => [...current, { id: crypto.randomUUID(), text, hidden: false }]);
    setDraft("");
  }

  return (
    <div className="chip-slot">
      <span className="chip-slot__label">{label}</span>

      <div className="chip-list">
        {shown.length === 0 && <span className="chip-slot__empty">None shown</span>}
        {shown.map((item) => (
          <span className="chip" key={item.id}>
            {item.text}
            <button aria-label={`Hide ${item.text}`} onClick={() => setHidden(item.id, true)} type="button">
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="chip-add">
        <input
          aria-label={`Add ${label}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addDraft();
            }
          }}
          placeholder={placeholder}
          value={draft}
        />
        <button className="text-button" onClick={addDraft} type="button">
          + Add
        </button>
      </div>

      {hidden.length > 0 && (
        <div className="chip-hidden">
          <span>Hidden. Click one to show it again.</span>
          <div className="chip-list">
            {hidden.map((item) => (
              <button
                aria-label={`Show ${item.text}`}
                className="chip chip--hidden"
                key={item.id}
                onClick={() => setHidden(item.id, false)}
                type="button"
              >
                + {item.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignCaseModal({ classrooms, initialDetail, onClose, onAssigned }) {
  const dialogRef = useRef(null);

  const [classroomId, setClassroomId] = useState(initialDetail?.classroom?.id || classrooms[0]?.id || "");
  const [detail, setDetail] = useState(initialDetail);
  const [audience, setAudience] = useState("all");
  const [groupId, setGroupId] = useState("");
  const [individualIds, setIndividualIds] = useState([]);

  const [patients, setPatients] = useState([]);
  const [patientRecordId, setPatientRecordId] = useState("");
  const [prefilling, setPrefilling] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [removed, setRemoved] = useState({});
  const [medications, setMedications] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [history, setHistory] = useState([]);
  const [criteria, setCriteria] = useState([{ description: "", points: "" }]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const students = detail?.students || [];
  const groups = detail?.groups || [];
  const age = removed.dateOfBirth ? "" : ageFromDob(form.dateOfBirth);
  const totalPoints = criteria.reduce((sum, item) => sum + (Number(item.points) || 0), 0);

  let selectedIds = individualIds;
  if (audience === "all") selectedIds = students.map((student) => student.id);
  if (audience === "group") {
    selectedIds = (groups.find((group) => group.id === groupId)?.students || []).map((student) => student.id);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Existing patients for the "start from a patient" dropdown
  useEffect(() => {
    let current = true;
    fetchInstructorPatients()
      .then((result) => {
        if (current) setPatients(result.patients || []);
      })
      .catch(() => {
        if (current) setPatients([]);
      });
    return () => {
      current = false;
    };
  }, []);

  // Load the students and groups of whichever class is selected
  useEffect(() => {
    if (!classroomId) return undefined;
    if (initialDetail?.classroom?.id === classroomId) {
      setDetail(initialDetail);
      return undefined;
    }
    let current = true;
    fetchInstructorClassroom(classroomId)
      .then((result) => {
        if (current) setDetail(result);
      })
      .catch((loadError) => {
        if (current) setError(loadError.message);
      });
    return () => {
      current = false;
    };
  }, [classroomId, initialDetail]);

  function changeClassroom(id) {
    setClassroomId(id);
    setDetail(null);
    setGroupId("");
    setIndividualIds([]);
    setError("");
  }

  function update(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function toggleRemoved(name) {
    setRemoved((previous) => ({ ...previous, [name]: !previous[name] }));
  }

  function toggleIndividual(id) {
    setIndividualIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }

  function updateCriterion(index, field, value) {
    setCriteria((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  async function prefillFromPatient(recordId) {
    setPatientRecordId(recordId);
    if (!recordId) return;
    try {
      setPrefilling(true);
      setError("");
      const { patient } = await fetchInstructorPatientDetails(recordId);
      setForm((previous) => ({
        ...previous,
        patientName: patient.name || "",
        dateOfBirth: patient.dateOfBirth || "",
        patientSex: patient.sex || "",
        results: vitalsText(patient.vitals),
      }));
      setMedications(toItems((patient.medications || []).map(medicationText).filter(Boolean)));
      setAllergies(toItems((patient.allergies || []).map(allergyText).filter(Boolean)));
      setHistory(toItems((patient.medicalHistory || []).map(historyText).filter(Boolean)));
      setRemoved({});
    } catch (prefillError) {
      setError(prefillError.message);
    } finally {
      setPrefilling(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedIds.length) {
      setError("Select at least one student.");
      return;
    }

    // A removed field is sent empty
    const keep = (name, value) => (removed[name] ? "" : value);

    try {
      setSaving(true);
      setError("");
      const result = await assignInstructorCase(classroomId, {
        noteType: form.noteType,
        studentIds: selectedIds,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        patientCase: {
          title: form.title,
          patientName: form.patientName,
          dateOfBirth: keep("dateOfBirth", form.dateOfBirth),
          patientAge: age,
          patientSex: keep("patientSex", form.patientSex),
          chiefComplaint: keep("chiefComplaint", form.chiefComplaint),
          history: visibleTexts(history).join("; "),
          medications: visibleTexts(medications),
          allergies: visibleTexts(allergies),
          results: keep("results", form.results),
        },
        expectations: {
          expectedDiagnoses: lines(form.expectedDiagnoses),
          instructorNotes: form.instructorNotes,
          rubricCriteria: criteria.filter((item) => item.description.trim()),
        },
      });
      onAssigned(result, classroomId);
      dialogRef.current?.close();
    } catch (assignError) {
      setError(assignError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog aria-labelledby="assign-case-title" className="assign-modal" onClose={onClose} ref={dialogRef}>
      <form className="assign-modal__form" onSubmit={handleSubmit}>
        <header className="assign-modal__header">
          <p className="section-label">Case assignment</p>
          <h2 id="assign-case-title">Assign a case</h2>
        </header>

        <div className="assign-modal__body admin-form admin-form--one">
          {/* 1. Class and students */}
          <section className="panel assign-modal__section">
            <h3>Class and students</h3>

            <label>
              Class
              <select onChange={(event) => changeClassroom(event.target.value)} value={classroomId}>
                {classrooms.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.short_name} · {item.full_name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="assign-audience">
              <legend>Assign to</legend>
              <label>
                <input checked={audience === "all"} onChange={() => setAudience("all")} type="radio" />
                Whole class ({students.length})
              </label>
              <label>
                <input checked={audience === "group"} onChange={() => setAudience("group")} type="radio" />
                A group
              </label>
              <label>
                <input
                  checked={audience === "individual"}
                  onChange={() => setAudience("individual")}
                  type="radio"
                />
                Individual students
              </label>
            </fieldset>

            {audience === "group" && (
            <label>
                Group
                <select onChange={(event) => setGroupId(event.target.value)} value={groupId}>
                <option value="">Choose a group</option>
                {groups.map((group) => (
                    <option disabled={!group.students.length} key={group.id} value={group.id}>
                    {group.name} ({group.students.length})
                    </option>
                ))}
                </select>
            </label>
            )}

            {audience === "individual" && (
              <div className="eligible-learner-list">
                {students.map((student) => (
                  <label key={student.id}>
                    <input
                      checked={individualIds.includes(student.id)}
                      onChange={() => toggleIndividual(student.id)}
                      type="checkbox"
                    />
                    {student.name}
                  </label>
                ))}
              </div>
            )}

            <p className="preview-label">
              {selectedIds.length} student{selectedIds.length === 1 ? "" : "s"} selected
            </p>
          </section>

          {/* 2. Patient */}
          <section className="assign-modal__section">
            <h3>Patient case</h3>

            <label>
              Start from an existing patient (optional)
              <select
                disabled={prefilling}
                onChange={(event) => prefillFromPatient(event.target.value)}
                value={patientRecordId}
              >
                <option value="">{prefilling ? "Loading patient..." : "Choose a patient to prefill"}</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="create-class-form__hint">
              Prefilled details are a copy. Remove anything the student should not see. Phone and address are not copied.
            </p>

            <label>
              Case title
              <input name="title" onChange={update} required value={form.title} />
            </label>
            <label>
              Patient name
              <input name="patientName" onChange={update} required value={form.patientName} />
            </label>

            <div className="assign-grid">
              <Slot
                id="dateOfBirth"
                label="Date of birth"
                onToggle={() => toggleRemoved("dateOfBirth")}
                removed={removed.dateOfBirth}
              >
                <input id="dateOfBirth" name="dateOfBirth" onChange={update} type="date" value={form.dateOfBirth} />
                {age !== "" && <small>Age {age}</small>}
              </Slot>

              <Slot
                id="patientSex"
                label="Sex"
                onToggle={() => toggleRemoved("patientSex")}
                removed={removed.patientSex}
              >
                <select id="patientSex" name="patientSex" onChange={update} value={form.patientSex}>
                  <option value="">Not specified</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </Slot>
            </div>

            <Slot
              id="chiefComplaint"
              label="Chief complaint"
              onToggle={() => toggleRemoved("chiefComplaint")}
              removed={removed.chiefComplaint}
            >
              <textarea
                id="chiefComplaint"
                name="chiefComplaint"
                onChange={update}
                rows={2}
                value={form.chiefComplaint}
              />
            </Slot>

            <ChipSlot items={history} label="Medical history" placeholder="Add a condition" setItems={setHistory} />
            <ChipSlot items={medications} label="Medications" placeholder="Add a medication, dose, frequency" setItems={setMedications} />
            <ChipSlot items={allergies} label="Allergies" placeholder="Add an allergen and reaction" setItems={setAllergies} /> 

            <Slot
              id="results"
              label="Results (vitals, labs)"
              onToggle={() => toggleRemoved("results")}
              removed={removed.results}
            >
              <textarea id="results" name="results" onChange={update} rows={2} value={form.results} />
            </Slot>
          </section>

          {/* 3. Note and due date */}
          <section className="assign-modal__section">
            <h3>Note and due date</h3>
            <div className="assign-grid">
              <label>
                Note type
                <select name="noteType" onChange={update} value={form.noteType}>
                  {NOTE_TYPES.map((type) => (
                    <option disabled={!type.available} key={type.id} value={type.id}>
                      {type.label}
                      {type.available ? "" : " (coming soon)"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date (optional)
                <input name="dueAt" onChange={update} type="datetime-local" value={form.dueAt} />
              </label>
            </div>
          </section>

          {/* 4. Expected answers */}
          <section className="assign-modal__section">
            <h3>Expected answers and rubric</h3>
            <p className="create-class-form__hint">Only instructors can see the answer key.</p>

            <label>
              Expected diagnoses (one per line)
              <textarea name="expectedDiagnoses" onChange={update} rows={2} value={form.expectedDiagnoses} />
            </label>

            <div className="rubric-editor">
              <p>Rubric (total: {totalPoints} points)</p>
              {criteria.map((item, index) => (
                <div className="rubric-editor__row" key={index}>
                  <input
                    aria-label={`Criterion ${index + 1}`}
                    onChange={(event) => updateCriterion(index, "description", event.target.value)}
                    placeholder="What the student should show"
                    value={item.description}
                  />
                  <input
                    aria-label={`Points for criterion ${index + 1}`}
                    min="0"
                    onChange={(event) => updateCriterion(index, "points", event.target.value)}
                    placeholder="Pts"
                    type="number"
                    value={item.points}
                  />
                  <button
                    aria-label={`Remove criterion ${index + 1}`}
                    className="row-action"
                    onClick={() => setCriteria((current) => current.filter((_, i) => i !== index))}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                className="text-button"
                onClick={() => setCriteria((current) => [...current, { description: "", points: "" }])}
                type="button"
              >
                + Add criterion
              </button>
            </div>

            <label>
              Notes for the grader
              <textarea name="instructorNotes" onChange={update} rows={2} value={form.instructorNotes} />
            </label>
          </section>

          {error && <p role="alert">{error}</p>}
        </div>

        <footer className="admin-form__actions">
          <button
            className="secondary-button"
            disabled={saving}
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            Cancel
          </button>
          <button className="primary-button" disabled={saving || !selectedIds.length} type="submit">
            {saving ? "Assigning..." : "Assign case"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export default AssignCaseModal;