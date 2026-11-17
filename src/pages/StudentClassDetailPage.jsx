import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import { fetchStudentClass } from "../lib/api";

function Fact({ icon, label, value }) {
  return (
    <div className="class-fact">
      <span className="class-fact__label"><Icon name={icon} size={14} /> {label}</span>
      <strong className="class-fact__value">{value}</strong>
    </div>
  );
}

function statusClassName(status = "") {
  return status.toLowerCase().replaceAll(" ", "-");
}

function formatDate(value, options = {}) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }).format(new Date(value));
}

function StudentClassDetailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const classroomId = searchParams.get("id");

  const [classroom, setClassroom] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [caseFilter, setCaseFilter] = useState("all");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);

  useEffect(() => {
    if (!classroomId) {
      setErrorMessage("No class selected.");
      setStatus("error");
      return undefined;
    }

    let ignore = false;

    fetchStudentClass(classroomId)
      .then((data) => {
        if (ignore) return;
        setClassroom(data);
        setSelectedAssignmentId(data.cases?.[0]?.assignmentId || null);
        setStatus("ready");
      })
      .catch((error) => {
        if (ignore) return;
        setErrorMessage(error.message);
        setStatus("error");
      });

    return () => {
      ignore = true;
    };
  }, [classroomId]);

  const cases = classroom?.cases || [];
  const filteredCases = useMemo(() => {
    if (caseFilter === "active") {
      return cases.filter((item) => !["Approved", "Completed", "Checked out"].includes(item.noteStatus));
    }
    if (caseFilter === "graded") {
      return cases.filter((item) => item.grade);
    }
    return cases;
  }, [caseFilter, cases]);
  const selectedCase = filteredCases.find((item) => item.assignmentId === selectedAssignmentId) || filteredCases[0] || null;
  const gradedCases = cases.filter((item) => item.grade);
  const averageGrade = gradedCases.length
    ? Math.round(gradedCases.reduce((total, item) => total + (item.grade.earnedPoints / item.grade.possiblePoints) * 100, 0) / gradedCases.length)
    : null;
  const activeCases = cases.filter((item) => !["Approved", "Completed", "Checked out"].includes(item.noteStatus)).length;

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Class detail</p>
          <h1>{classroom?.full_name || "Class"}</h1>
          {classroom && (
            <p>
              {classroom.short_name} · {classroom.term}
            </p>
          )}
        </div>
        <button
          className="secondary-button back-button"
          onClick={() => navigate("/student/classes")}
          type="button"
        >
          <Icon name="arrow" size={16} /> Back to classes
        </button>
      </section>

      {status === "loading" && (
        <section className="panel data-panel">
          <p>Loading class...</p>
        </section>
      )}

      {status === "error" && (
        <section className="panel data-panel">
          <p role="alert">{errorMessage}</p>
        </section>
      )}

      {status === "ready" && classroom && (
        <div className="class-detail">
            <section className="class-detail__facts">
            <Fact icon="grid" label="Discipline" value={classroom.discipline || "Not set"} />
            <Fact icon="chart" label="CRN" value={classroom.crn} />
            <Fact icon="patients" label="Room" value={classroom.room || "Not set"} />
            <Fact icon="calendar" label="Term" value={classroom.term} />
            </section>

            <section className="class-detail__columns">
            <article className="panel class-detail__card">
                <p className="section-label"><Icon name="patients" size={14} /> Instructor</p>
                {classroom.instructors.length ? (
                <ul className="class-chips">
                    {classroom.instructors.map((name) => (
                    <li key={name}>{name}</li>
                    ))}
                </ul>
                ) : (
                <p className="class-detail__note">Not assigned yet.</p>
                )}
                <p className="class-detail__note">
                Enrolled since{" "}
                {classroom.enrolledAt
                    ? new Date(classroom.enrolledAt).toLocaleDateString()
                    : "an unknown date"}
                </p>
            </article>

            <article className="panel class-detail__card">
                <p className="section-label"><Icon name="grid" size={14} /> Your group</p>
                <h2>{classroom.group ? classroom.group.name : "No group yet"}</h2>
                {classroom.group &&
                (classroom.group.teammates.length ? (
                    <ul className="class-chips">
                    {classroom.group.teammates.map((name) => (
                        <li key={name}>{name}</li>
                    ))}
                    </ul>
                ) : (
                    <p className="class-detail__note">You are the only member so far.</p>
                ))}
            </article>
            </section>

            <section className="panel class-case-workspace">
              <div className="class-case-workspace__heading">
                <div>
                  <p className="section-label"><Icon name="chart" size={14} /> Clinical learning</p>
                  <h2>Cases & grades</h2>
                  <p>Track case work, instructor feedback, and scored submissions for this class.</p>
                </div>
                <span className="class-case-workspace__count">{cases.length} assigned</span>
              </div>

              <div className="class-case-stats">
                <article>
                  <span>Active cases</span>
                  <strong>{activeCases}</strong>
                  <small>Ready for your work</small>
                </article>
                <article>
                  <span>Submitted / reviewed</span>
                  <strong>{cases.filter((item) => ["Pending Review", "Approved", "Returned"].includes(item.noteStatus)).length}</strong>
                  <small>Cases with a note submitted</small>
                </article>
                <article className="class-case-stats__grade">
                  <span>Current average</span>
                  <strong>{averageGrade === null ? "—" : `${averageGrade}%`}</strong>
                  <small>{gradedCases.length ? `${gradedCases.length} graded case${gradedCases.length === 1 ? "" : "s"}` : "Grades appear after review"}</small>
                </article>
              </div>

              {cases.length ? (
                <div className="class-case-workspace__body">
                  <div className="class-case-list" aria-label="Assigned cases">
                    <div className="class-case-list__filters">
                      {[
                        ["all", "All"],
                        ["active", "To do"],
                        ["graded", "Graded"],
                      ].map(([value, label]) => (
                        <button
                          className={caseFilter === value ? "class-case-filter class-case-filter--active" : "class-case-filter"}
                          key={value}
                          onClick={() => setCaseFilter(value)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {filteredCases.length ? filteredCases.map((item) => (
                      <button
                        className={selectedCase?.assignmentId === item.assignmentId ? "class-case-row class-case-row--selected" : "class-case-row"}
                        key={item.assignmentId}
                        onClick={() => setSelectedAssignmentId(item.assignmentId)}
                        type="button"
                      >
                        <span className="class-case-row__avatar">{item.patientName.slice(0, 1)}</span>
                        <span className="class-case-row__content">
                          <strong>{item.title}</strong>
                          <small>{item.patientName} · {item.noteType.toUpperCase()}</small>
                        </span>
                        <span className={`class-case-status class-case-status--${statusClassName(item.noteStatus)}`}>{item.noteStatus}</span>
                      </button>
                    )) : <p className="class-case-empty">No cases match this view.</p>}
                  </div>

                  {selectedCase && (
                    <article className="class-case-preview">
                      <div className="class-case-preview__header">
                        <div>
                          <p className="section-label">Selected case</p>
                          <h3>{selectedCase.title}</h3>
                          <p>{selectedCase.patientName}{selectedCase.patientAge ? ` · ${selectedCase.patientAge} years` : ""}{selectedCase.patientSex ? ` · ${selectedCase.patientSex}` : ""}</p>
                        </div>
                        <button className="primary-button" onClick={() => navigate(`/student/case?id=${selectedCase.assignmentId}`)} type="button">
                          Open case <Icon name="arrow" size={15} />
                        </button>
                      </div>

                      <div className="class-case-preview__details">
                        <div><span>Documentation</span><strong>{selectedCase.noteType.toUpperCase()} note</strong></div>
                        <div><span>Due</span><strong>{formatDate(selectedCase.dueAt)}</strong></div>
                        <div><span>Case status</span><strong>{selectedCase.encounterStatus}</strong></div>
                      </div>

                      {selectedCase.chiefComplaint && (
                        <div className="class-case-preview__complaint">
                          <span>Chief concern</span>
                          <p>{selectedCase.chiefComplaint}</p>
                        </div>
                      )}

                      <div className="class-case-preview__review">
                        <div>
                          <span>Instructor feedback</span>
                          {selectedCase.feedback ? (
                            <p>{selectedCase.feedback.comments || `${selectedCase.feedback.decision} on ${formatDate(selectedCase.feedback.reviewedAt)}.`}</p>
                          ) : (
                            <p className="class-detail__note">Submit your documentation to receive instructor feedback.</p>
                          )}
                        </div>
                        <div className="class-case-grade">
                          <span>Grade</span>
                          {selectedCase.grade ? (
                            <strong>{selectedCase.grade.earnedPoints} <small>/ {selectedCase.grade.possiblePoints} pts</small></strong>
                          ) : <strong>Pending</strong>}
                        </div>
                      </div>
                    </article>
                  )}
                </div>
              ) : (
                <div className="class-case-empty class-case-empty--large">
                  <span className="student-summary-card__icon"><Icon name="chart" size={20} /></span>
                  <div><strong>No cases are assigned yet</strong><p>Your instructor’s cases will appear here with their due dates, requirements, and feedback.</p></div>
                </div>
              )}
            </section>
        </div>
        )}
    </div>
  );
}

export default StudentClassDetailPage;
