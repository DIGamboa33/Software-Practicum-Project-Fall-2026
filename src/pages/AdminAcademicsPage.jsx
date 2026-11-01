import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import {
  assignAdminClassroomInstructor,
  bulkInviteStudents,
  createAdminClassroom,
  fetchAdminAcademics,
  updateAdminClassroomDisciplines,
} from "../lib/api";
import "./AdminAcademicsPage.css";


const initialClassroom = {
  crn: "",
  fullName: "",
  shortName: "",
  room: "",
  term: "Fall 2026",
  disciplineSubroleId: "",
  additionalSubroleIds: [],
  instructorId: "",
};

function parseStudents(value, subroleId) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [firstName = "", lastName = "", utepId = ""] = line.split(",").map((item) => item.trim());
      return { firstName, lastName, utepId, subroleId: Number(subroleId) };
    });
}

function AdminAcademicsPage() {
  const [academics, setAcademics] = useState({ semesters: [], classrooms: [], students: [], instructors: [], subroles: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("all");
  const [classroomPage, setClassroomPage] = useState(1);
  const [studentPage, setStudentPage] = useState(1);
  const [classroomsPerPage, setClassroomsPerPage] = useState(8);
  const [studentsPerPage, setStudentsPerPage] = useState(10);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [classroomForm, setClassroomForm] = useState(initialClassroom);
  const [editingAllowedIds, setEditingAllowedIds] = useState([]);
  const [bulkRows, setBulkRows] = useState("");
  const [bulkSubroleId, setBulkSubroleId] = useState("");
  const [temporaryCredentials, setTemporaryCredentials] = useState([]);
  const [instructorId, setInstructorId] = useState("");

  async function loadAcademics() {
    const result = await fetchAdminAcademics();
    setAcademics(result);
    setSelectedClassroomId((current) => (
      result.classrooms.some((classroom) => classroom.id === current) ? current : ""
    ));
  }

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      try {
        const result = await fetchAdminAcademics();
        if (!isCurrent) return;
        setAcademics(result);
        setSelectedClassroomId("");
        setStatus("ready");
      } catch (loadError) {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load academic administration.");
        setStatus("error");
      }
    }
    load();
    return () => { isCurrent = false; };
  }, []);

  const visibleClassrooms = useMemo(
    () => academics.classrooms.filter((classroom) => selectedTerm === "all" || classroom.term === selectedTerm),
    [academics.classrooms, selectedTerm],
  );
  const selectedClassroom = academics.classrooms.find((classroom) => classroom.id === selectedClassroomId) || null;
  const paginatedClassrooms = visibleClassrooms.slice(
    (classroomPage - 1) * classroomsPerPage,
    classroomPage * classroomsPerPage,
  );
  const paginatedStudents = (selectedClassroom?.students || []).slice(
    (studentPage - 1) * studentsPerPage,
    studentPage * studentsPerPage,
  );
  const matchingInstructors = academics.instructors.filter(
    (instructor) => instructor.subroleId === selectedClassroom?.discipline_subrole_id,
  );
  const formInstructors = academics.instructors.filter(
    (instructor) => String(instructor.subroleId) === String(classroomForm.disciplineSubroleId),
  );
  const activeClassrooms = academics.classrooms.filter((classroom) => classroom.status === "active").length;
  const enrollmentByTerm = useMemo(() => Object.entries(
    academics.classrooms.reduce((totals, classroom) => ({
      ...totals,
      [classroom.term]: (totals[classroom.term] || 0) + classroom.studentCount,
    }), {}),
  ).map(([term, count]) => ({ term, count })), [academics.classrooms]);
  const classroomsByDiscipline = useMemo(() => Object.entries(
    academics.classrooms.reduce((totals, classroom) => ({
      ...totals,
      [classroom.discipline]: (totals[classroom.discipline] || 0) + 1,
    }), {}),
  ).map(([discipline, count]) => ({ discipline, count })), [academics.classrooms]);

  function updateClassroom(field, value) {
    setClassroomForm((current) => ({
      ...current,
      [field]: value,

      //If the primary discipline changes,
      // then reset the instructor and remove the new primary
      // from the list of additional disciplines
      ...(field === "disciplineSubroleId"
        ? {
          instructorId: "",
          additionalSubroleIds: current.additionalSubroleIds.filter(
            (id) => id !== String(value)
          )
        }
        : {}),
    }));
  }


  // Derek additional classroom disciplines.
  function toggleAdditionalDiscipline(subroleId) {

    const id = String(subroleId);

    setClassroomForm((current) => {

      const selected = current.additionalSubroleIds;

      // Remove the discipline if already selected.
      if (selected.includes(id)) {
        return {
          ...current,
          additionalSubroleIds:
            selected.filter((item) => item !== id)
        };
      }

      // Otherwise add the discipline.
      return {
        ...current,
        additionalSubroleIds: [...selected, id]
      };
    });
  }


  async function runAction(action) {
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      await loadAcademics();
      setNotice(result.message);
      return result;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to save this change.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  function submitClassroom(event) {
    event.preventDefault();
    runAction(async () => {
      const result = await createAdminClassroom(classroomForm);
      setClassroomForm(initialClassroom);
      setIsCreateOpen(false);
      setSelectedClassroomId(result.classroom.id);
      return result;
    });
  }

  // Load the accepted disciplines whenever the Admin
  // opens a classroom or the classroom data changes.
  useEffect(() => {
    const classroom = academics.classrooms.find(
      (item) => item.id === selectedClassroomId
    );

    setEditingAllowedIds(
      (classroom?.allowedSubroleIds || []).map(String)
    );
  }, [selectedClassroomId, academics.classrooms]);

  function submitBulkStudents(event) {
    event.preventDefault();
    const students = parseStudents(bulkRows, bulkSubroleId);
    runAction(async () => {
      const result = await bulkInviteStudents(students);
      setBulkRows("");
      setTemporaryCredentials(result.created || []);
      if (result.failed?.length) {
        return {
          ...result,
          message: `${result.message} ${result.failed.length} row${result.failed.length === 1 ? " needs" : "s need"} attention.`,
        };
      } else {
        setIsBulkOpen(false);
      }
      return result;
    });
  }


  // Add or remove a discipline from the editing selection.
  function toggleEditedDiscipline(subroleId) {
    const id = String(subroleId);

    setEditingAllowedIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      return [...current, id];
    });
  }

  // Save accepted disciplines for the selected classroom.
  function submitAcceptedDisciplines(event) {
    event.preventDefault();

    if (!selectedClassroom) return;

    // The backend automatically keeps the primary discipline.
    // We only send the additional selected disciplines.
    const additionalIds = editingAllowedIds
      .filter(
        (id) =>
          id !== String(selectedClassroom.discipline_subrole_id)
      )
      .map(Number);

    runAction(() =>
      updateAdminClassroomDisciplines(
        selectedClassroom.id,
        additionalIds
      )
    );
  }


  function submitInstructor(event) {
    event.preventDefault();
    if (!selectedClassroom) return;
    runAction(async () => {
      const result = await assignAdminClassroomInstructor(selectedClassroom.id, instructorId);
      setInstructorId("");
      return result;
    });
  }

  return (
    <div className="dashboard-page content-page admin-academics-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Administration · academic operations</p>
          <h1>Semesters & classrooms</h1>
          <p>Provision classrooms, place the right instructor in each course, and keep a clear view of every registered learner.</p>
        </div>
        <div className="admin-academics-actions">
          <button className="secondary-button" onClick={() => setIsBulkOpen(true)} type="button"><Icon name="plus" size={15} /> Bulk add students</button>
          <button className="primary-button directory-create-button" onClick={() => setIsCreateOpen(true)} type="button"><Icon name="plus" size={15} /> Create classroom</button>
        </div>
      </section>

      {(error || notice) && <section className={`panel directory-action-message ${error ? "directory-error" : "directory-success"}`} role="status">{error || notice}</section>}

      {temporaryCredentials.length > 0 && (
        <section className="panel temporary-credentials-panel">
          <div className="panel__header">
            <div>
              <p className="section-label">One-time secure handoff</p>
              <h2>Temporary student passwords</h2>
            </div>
            <button aria-label="Hide temporary passwords" className="row-action" onClick={() => setTemporaryCredentials([])} type="button">×</button>
          </div>
          <p>Record these now. Careflow cannot show the passwords again after this panel is closed or refreshed. Students should change them after their first sign-in.</p>
          <div className="temporary-credentials-list">
            {temporaryCredentials.map((credential) => (
              <div key={credential.id}>
                <span><strong>{credential.name}</strong><small>{credential.email}</small></span>
                <code>{credential.temporaryPassword}</code>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="directory-metrics admin-academics-metrics">
        <article className="panel admin-metric-card"><span className="admin-metric-card__icon admin-metric-card__icon--purple"><Icon name="calendar" size={18} /></span><div><span>Semesters on file</span><strong>{academics.semesters.length}</strong><small>All configured terms</small></div></article>
        <article className="panel admin-metric-card"><span className="admin-metric-card__icon admin-metric-card__icon--blue"><Icon name="chart" size={18} /></span><div><span>Active classrooms</span><strong>{activeClassrooms}</strong><small>Currently available courses</small></div></article>
        <article className="panel admin-metric-card"><span className="admin-metric-card__icon admin-metric-card__icon--mint"><Icon name="patients" size={18} /></span><div><span>Student accounts</span><strong>{academics.students.length}</strong><small>Profiles with Student access</small></div></article>
        <article className="panel admin-metric-card"><span className="admin-metric-card__icon admin-metric-card__icon--orange"><Icon name="grid" size={18} /></span><div><span>Faculty accounts</span><strong>{academics.instructors.length}</strong><small>Available for assignments</small></div></article>
      </section>

      <section className="admin-academic-insights">
        <article className="panel admin-mini-chart">
          <div className="panel__header"><div><p className="section-label">Enrollment trend</p><h2>Students by semester</h2></div><Icon name="chart" size={19} /></div>
          {enrollmentByTerm.length ? <div className="admin-visual-canvas admin-visual-canvas--academic"><ResponsiveContainer height="100%" width="100%"><BarChart data={enrollmentByTerm} margin={{ left: -20, right: 8, top: 10 }}><CartesianGrid stroke="#edf0f5" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="term" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip formatter={(value) => [`${value} students`, "Enrollment"]} /><Bar dataKey="count" fill="#6277d8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="directory-loading">Create a classroom to begin tracking enrollment.</p>}
        </article>
        <article className="panel admin-mini-chart">
          <div className="panel__header"><div><p className="section-label">Program coverage</p><h2>Classes by discipline</h2></div><Icon name="grid" size={19} /></div>
          {classroomsByDiscipline.length ? <div className="admin-visual-canvas admin-visual-canvas--academic"><ResponsiveContainer height="100%" width="100%"><BarChart data={classroomsByDiscipline} layout="vertical" margin={{ left: -10, right: 8, top: 6 }}><CartesianGrid horizontal={false} stroke="#edf0f5" strokeDasharray="3 3" /><XAxis allowDecimals={false} type="number" tick={{ fontSize: 11 }} /><YAxis dataKey="discipline" tick={{ fontSize: 11 }} type="category" width={82} /><Tooltip formatter={(value) => [`${value} classes`, "Classrooms"]} /><Bar dataKey="count" fill="#45bca2" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div> : <p className="directory-loading">Discipline coverage will appear when classrooms are added.</p>}
        </article>
      </section>

      {isCreateOpen && (
        <section className="panel admin-academics-form-panel">
          <div className="panel__header"><div><p className="section-label">Admin provisioned classroom</p><h2>Create a class</h2></div><button aria-label="Close classroom form" className="row-action" onClick={() => setIsCreateOpen(false)} type="button">×</button></div>
          <form className="admin-form" onSubmit={submitClassroom}>
            <label>CRN<input onChange={(event) => updateClassroom("crn", event.target.value)} required value={classroomForm.crn} /></label>
            <label>Full name<input onChange={(event) => updateClassroom("fullName", event.target.value)} required value={classroomForm.fullName} /></label>
            <label>Short name<input onChange={(event) => updateClassroom("shortName", event.target.value)} required value={classroomForm.shortName} /></label>
            <label>Semester<input onChange={(event) => updateClassroom("term", event.target.value)} required value={classroomForm.term} /></label>
            <label>Room <span>Optional</span><input onChange={(event) => updateClassroom("room", event.target.value)} value={classroomForm.room} /></label>
            <label>Discipline<select onChange={(event) => updateClassroom("disciplineSubroleId", event.target.value)} required value={classroomForm.disciplineSubroleId}><option value="">Choose discipline</option>{academics.subroles.map((subrole) => <option key={subrole.id} value={subrole.id}>{subrole.name}</option>)}</select></label>
            <label>Lead instructor <span>Optional</span><select disabled={!classroomForm.disciplineSubroleId} onChange={(event) => updateClassroom("instructorId", event.target.value)} value={classroomForm.instructorId}><option value="">Assign later</option>{formInstructors.map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select></label>

            <fieldset className="accepted-disciplines">
              <legend>Accepted Student Disciplines</legend>

              <p>
                Select additional disciplines allowed to enroll.
                The primary discipline is always included.
              </p>

              <div className="accepted-disciplines-grid">
                {academics.subroles.map((subrole) => {

                  const id = String(subrole.id);

                  const isPrimary =
                    String(classroomForm.disciplineSubroleId) === id;

                  const isSelected =
                    isPrimary ||
                    classroomForm.additionalSubroleIds.includes(id);

                  return (
                    <label
                      key={subrole.id}
                      className="accepted-discipline-option"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isPrimary}
                        onChange={() => toggleAdditionalDiscipline(id)}
                      />

                      <span>
                        {subrole.name}
                        {isPrimary ? " (Primary)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="admin-form__actions"><button className="secondary-button" onClick={() => setIsCreateOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "Creating…" : "Create classroom"}</button></div>
          </form>
        </section>
      )}

      {isBulkOpen && (
        <section className="panel admin-academics-form-panel">
          <div className="panel__header"><div><p className="section-label">Student provisioning</p><h2>Create student accounts in bulk</h2></div><button aria-label="Close bulk student form" className="row-action" onClick={() => setIsBulkOpen(false)} type="button">×</button></div>
          <form className="bulk-student-form" onSubmit={submitBulkStudents}>
            <label>Discipline<select onChange={(event) => setBulkSubroleId(event.target.value)} required value={bulkSubroleId}><option value="">Choose discipline</option>{academics.subroles.map((subrole) => <option key={subrole.id} value={subrole.id}>{subrole.name}</option>)}</select></label>
            <label>Student rows <span>One per line: First name, Last name, UTEP ID (optional)</span><textarea onChange={(event) => setBulkRows(event.target.value)} placeholder={"Avery, Morgan, 80123456\nElena, Rivera, 80123457"} required value={bulkRows} /></label>
            <p className="bulk-student-form__hint">Careflow creates unique <strong>first.last.123456@careflow.test</strong> accounts with a temporary password shown once after creation.</p>
            <div className="admin-form__actions"><button className="secondary-button" onClick={() => setIsBulkOpen(false)} type="button">Cancel</button><button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "Creating accounts…" : "Create student accounts"}</button></div>
          </form>
        </section>
      )}

      <section className="admin-academics-toolbar panel">
        <div><p className="section-label">Classroom directory</p><h2>Current academic roster</h2></div>
        <label>Semester<select onChange={(event) => { setSelectedTerm(event.target.value); setClassroomPage(1); }} value={selectedTerm}><option value="all">All semesters</option>{academics.semesters.map((term) => <option key={term} value={term}>{term}</option>)}</select></label>
      </section>

      {status === "loading" && <section className="panel directory-loading">Loading academic information…</section>}
      {status === "error" && <section className="panel directory-error">{error}</section>}
      {status === "ready" && (
        <section className="admin-classroom-directory">
          <article className="panel directory-table-panel">
            <div className="academic-class-list admin-scroll-list">
              {paginatedClassrooms.map((classroom) => <button className={selectedClassroom?.id === classroom.id ? "academic-class-row academic-class-row--selected" : "academic-class-row"} key={classroom.id} onClick={() => { setSelectedClassroomId(classroom.id); setStudentPage(1); }} type="button"><div><strong>{classroom.short_name}</strong><small>{classroom.full_name}</small></div><span>{classroom.term}</span><span>{classroom.discipline}</span><span>{classroom.studentCount} students</span></button>)}
              {!visibleClassrooms.length && <p className="directory-loading">No classrooms match this semester.</p>}
            </div>
            <Pagination currentPage={classroomPage} itemLabel="classrooms" onPageChange={setClassroomPage} onPageSizeChange={(nextPageSize) => { setClassroomsPerPage(nextPageSize); setClassroomPage(1); }} pageSize={classroomsPerPage} totalItems={visibleClassrooms.length} />
          </article>
        </section>
      )}

      {selectedClassroom && (
        <section
          aria-label={`Classroom details for ${selectedClassroom.full_name}`}
          className="account-modal-backdrop"
          onMouseDown={() => setSelectedClassroomId("")}
          role="presentation"
        >
          <article
            aria-modal="true"
            className="panel academic-classroom-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel__header">
              <div>
                <p className="section-label">Classroom overview</p>
                <h2>{selectedClassroom.full_name}</h2>
              </div>
              <button aria-label="Close classroom details" className="row-action" onClick={() => setSelectedClassroomId("")} type="button">×</button>
            </div>
            <p className="academic-detail-panel__metadata">{selectedClassroom.short_name} · CRN {selectedClassroom.crn} · {selectedClassroom.room || "Room not set"}</p>
            <div className="classroom-stat-line"><span>{selectedClassroom.term}</span><span>{selectedClassroom.discipline}</span><span>{selectedClassroom.studentCount} enrolled</span></div>

            {/* Derek: Edit disciplines for an existing classroom. */}
            <form
              className="admin-form"
              onSubmit={submitAcceptedDisciplines}
              style={{ margin: "18px 0" }}
            >
              <fieldset className="accepted-disciplines">
                <legend>Edit Accepted Student Disciplines</legend>

                <p>
                  Choose which disciplines can enroll in this classroom.
                  The primary discipline must remain selected.
                </p>

                <div className="accepted-disciplines-grid">
                  {academics.subroles.map((subrole) => {
                    const id = String(subrole.id);

                    const isPrimary =
                      id === String(selectedClassroom.discipline_subrole_id);

                    const isSelected =
                      isPrimary || editingAllowedIds.includes(id);

                    return (
                      <label
                        className="accepted-discipline-option"
                        key={id}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPrimary || isSaving}
                          onChange={() => toggleEditedDiscipline(id)}
                        />

                        <span>
                          {subrole.name}
                          {isPrimary ? " (Primary)" : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="admin-form__actions">
                <button
                  className="primary-button"
                  disabled={isSaving}
                  type="submit"
                >
                  {isSaving ? "Saving..." : "Save accepted disciplines"}
                </button>
              </div>
            </form>

            <section className="academic-classroom-modal__grid">
              <div>
                <div className="academic-instructor-list"><strong>Assigned instructors</strong>{selectedClassroom.instructors.length ? selectedClassroom.instructors.map((instructor) => <div key={instructor.id}><span>{instructor.name.split(" ").map((part) => part[0]).join("")}</span><p>{instructor.name}<small>{instructor.accessLevel === "owner" ? "Lead instructor" : "Co-instructor"}</small></p></div>) : <p className="directory-loading">No instructor assigned yet.</p>}</div>
                <form className="admin-form admin-form--compact" onSubmit={submitInstructor}><p className="section-label">Assign instructor</p><select onChange={(event) => setInstructorId(event.target.value)} required value={instructorId}><option value="">Choose {selectedClassroom.discipline} instructor</option>{matchingInstructors.filter((instructor) => !selectedClassroom.instructors.some((assigned) => assigned.id === instructor.id)).map((instructor) => <option key={instructor.id} value={instructor.id}>{instructor.name}</option>)}</select><button className="secondary-button" disabled={isSaving || !matchingInstructors.length} type="submit">Assign instructor</button></form>
              </div>
              <div className="academic-student-panel academic-student-panel--modal"><p className="section-label">Class roster</p><h2>Enrolled students</h2><div className="admin-scroll-list">{paginatedStudents.map((student) => <p key={student.id}><strong>{student.name}</strong><small>{student.subrole || "Discipline not set"}{student.utepId ? ` · ${student.utepId}` : ""}</small></p>)}{!selectedClassroom.students.length && <p className="directory-loading">No students are enrolled in this classroom yet.</p>}</div><Pagination currentPage={studentPage} itemLabel="enrolled students" onPageChange={setStudentPage} onPageSizeChange={(nextPageSize) => { setStudentsPerPage(nextPageSize); setStudentPage(1); }} pageSize={studentsPerPage} totalItems={selectedClassroom.students.length} /></div>
            </section>
          </article>
        </section>
      )}
    </div>
  );
}

export default AdminAcademicsPage;
