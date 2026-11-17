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

function letterGrade(percentage) {
  if (percentage >= 90) return "A";
  if (percentage >= 80) return "B";
  if (percentage >= 70) return "C";
  if (percentage >= 60) return "D";
  return "F";
}

function dueLabel(value) {
  const dueDate = new Date(value);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const difference = Math.round((startOfDueDate - startOfToday) / 86_400_000);

  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  if (difference > 1) return `Due in ${difference} days`;
  if (difference === -1) return "1 day past due";
  return `${Math.abs(difference)} days past due`;
}

function buildToDoItems(cases) {
  const now = new Date();

  return cases
    .map((item) => {
      const dueDate = item.dueAt ? new Date(item.dueAt) : null;
      const isFinal = ["Approved", "Completed", "Checked out"].includes(item.noteStatus);

      if (item.noteStatus === "Returned") {
        return {
          assignmentId: item.assignmentId,
          title: `Revise ${item.title}`,
          detail: item.feedback?.comments || "Your instructor returned this work for revision.",
          priority: "Needs revision",
          priorityOrder: 0,
          dueAt: item.dueAt,
        };
      }

      if (!isFinal && dueDate && dueDate < now) {
        return {
          assignmentId: item.assignmentId,
          title: `Complete ${item.title}`,
          detail: `${dueLabel(item.dueAt)} · ${item.patientName}`,
          priority: "Past due",
          priorityOrder: 1,
          dueAt: item.dueAt,
        };
      }

      if (!isFinal && item.noteStatus === "Draft") {
        return {
          assignmentId: item.assignmentId,
          title: `Finish your ${item.noteType.toUpperCase()} note`,
          detail: `${item.title} · ${item.patientName}`,
          priority: "In progress",
          priorityOrder: 2,
          dueAt: item.dueAt,
        };
      }

      if (!isFinal && item.noteStatus === "Not started") {
        return {
          assignmentId: item.assignmentId,
          title: `Begin ${item.title}`,
          detail: item.dueAt ? dueLabel(item.dueAt) : "No due date assigned",
          priority: "To do",
          priorityOrder: 3,
          dueAt: item.dueAt,
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((first, second) => {
      if (first.priorityOrder !== second.priorityOrder) {
        return first.priorityOrder - second.priorityOrder;
      }
      return new Date(first.dueAt || "9999-12-31") - new Date(second.dueAt || "9999-12-31");
    });
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
  const [workspaceTab, setWorkspaceTab] = useState("cases");

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
  const datedCases = cases.filter((item) => item.dueAt);
  const now = new Date();
  const upcomingCases = datedCases
    .filter((item) => new Date(item.dueAt) >= now)
    .sort((first, second) => new Date(first.dueAt) - new Date(second.dueAt));
  const pastDueCases = datedCases
    .filter((item) => new Date(item.dueAt) < now)
    .sort((first, second) => new Date(second.dueAt) - new Date(first.dueAt));
  const toDoItems = buildToDoItems(cases);
  const announcements = classroom?.announcements || [];

  function selectTimelineCase(item) {
    setCaseFilter("all");
    setSelectedAssignmentId(item.assignmentId);
  }

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

            <section className="class-workspace-tabs" aria-label="Class workspace">
              <div className="class-workspace-tabs__bar" role="tablist">
                {[
                  ["cases", "Cases & grades", cases.length],
                  ["schedule", "Schedule", datedCases.length],
                  ["todo", "To do", toDoItems.length],
                  ["announcements", "Announcements", announcements.length],
                ].map(([value, label, count]) => (
                  <button
                    aria-selected={workspaceTab === value}
                    className={workspaceTab === value ? "class-workspace-tab class-workspace-tab--active" : "class-workspace-tab"}
                    key={value}
                    onClick={() => setWorkspaceTab(value)}
                    role="tab"
                    type="button"
                  >
                    {label}<span>{count}</span>
                  </button>
                ))}
              </div>

              {workspaceTab === "cases" && (
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
                  <strong>
                    {averageGrade === null ? "—" : `${averageGrade}%`}
                    {averageGrade !== null && <em>{letterGrade(averageGrade)}</em>}
                  </strong>
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
              )}

              {workspaceTab === "schedule" && (
                <section className="panel class-case-timeline" aria-labelledby="class-case-timeline-title">
                  <div className="class-case-timeline__heading">
                    <div>
                      <p className="section-label"><Icon name="calendar" size={14} /> Assignment schedule</p>
                      <h3 id="class-case-timeline-title">Due-date timeline</h3>
                    </div>
                    <span>{datedCases.length} scheduled</span>
                  </div>
                  <div className="class-case-timeline__columns">
                    <div className="class-due-list">
                      <div className="class-due-list__heading">
                        <span className="class-due-dot class-due-dot--upcoming" />
                        <strong>Upcoming</strong>
                        <small>{upcomingCases.length}</small>
                      </div>
                      {upcomingCases.length ? upcomingCases.map((item) => (
                        <button className="class-due-item" key={item.assignmentId} onClick={() => selectTimelineCase(item)} type="button">
                          <time dateTime={item.dueAt}>{formatDate(item.dueAt, { month: "short", day: "numeric" })}</time>
                          <span><strong>{item.title}</strong><small>{item.patientName} · {dueLabel(item.dueAt)}</small></span>
                          <Icon name="arrow" size={15} />
                        </button>
                      )) : <p className="class-due-list__empty">No future due dates.</p>}
                    </div>
                    <div className="class-due-list class-due-list--past">
                      <div className="class-due-list__heading">
                        <span className="class-due-dot class-due-dot--past" />
                        <strong>Past due</strong>
                        <small>{pastDueCases.length}</small>
                      </div>
                      {pastDueCases.length ? pastDueCases.map((item) => (
                        <button className="class-due-item" key={item.assignmentId} onClick={() => selectTimelineCase(item)} type="button">
                          <time dateTime={item.dueAt}>{formatDate(item.dueAt, { month: "short", day: "numeric" })}</time>
                          <span><strong>{item.title}</strong><small>{item.patientName} · {item.noteStatus === "Approved" ? "Completed" : dueLabel(item.dueAt)}</small></span>
                          <Icon name="arrow" size={15} />
                        </button>
                      )) : <p className="class-due-list__empty">No past due dates.</p>}
                    </div>
                  </div>
                </section>
              )}

              {workspaceTab === "todo" && (
              <article className="panel class-to-do">
                <div className="class-classroom-feed__heading">
                  <div>
                    <p className="section-label"><Icon name="chart" size={14} /> Your next steps</p>
                    <h2>To do</h2>
                  </div>
                  <span>{toDoItems.length} open</span>
                </div>
                {toDoItems.length ? (
                  <div className="class-to-do__list">
                    {toDoItems.slice(0, 5).map((item) => (
                      <button className="class-to-do__item" key={item.assignmentId} onClick={() => navigate(`/student/case?id=${item.assignmentId}`)} type="button">
                        <span className={`class-to-do__priority class-to-do__priority--${statusClassName(item.priority)}`} />
                        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                        <span className={`class-to-do__badge class-to-do__badge--${statusClassName(item.priority)}`}>{item.priority}</span>
                        <Icon name="arrow" size={15} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="class-feed-empty"><span className="student-summary-card__icon student-summary-card__icon--mint"><Icon name="chart" size={18} /></span><div><strong>You’re all caught up</strong><p>No case work needs your attention right now.</p></div></div>
                )}
              </article>
              )}

              {workspaceTab === "announcements" && (
              <article className="panel class-announcements">
                <div className="class-classroom-feed__heading">
                  <div>
                    <p className="section-label"><Icon name="bell" size={14} /> Class updates</p>
                    <h2>Announcements</h2>
                  </div>
                  <span>{announcements.length}</span>
                </div>
                {announcements.length ? (
                  <div className="class-announcements__list">
                    {announcements.map((announcement) => (
                      <article className="class-announcement" key={announcement.id}>
                        <div><strong>{announcement.title}</strong>{announcement.is_pinned && <span>Pinned</span>}</div>
                        <p>{announcement.body}</p>
                        <small>{formatDate(announcement.created_at)}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="class-feed-empty"><span className="student-summary-card__icon"><Icon name="bell" size={18} /></span><div><strong>No announcements yet</strong><p>Updates from your instructor will appear here.</p></div></div>
                )}
              </article>
              )}
            </section>
        </div>
        )}
    </div>
  );
}

export default StudentClassDetailPage;
