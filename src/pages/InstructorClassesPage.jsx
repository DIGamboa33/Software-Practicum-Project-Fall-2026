import { useEffect, useState } from "react";
import {
  addInstructorGroupMembers,
  createInstructorClassroomGroup,
  fetchInstructorClassroom,
  fetchInstructorClassrooms,
  enrollInstructorStudents,
} from "../lib/api";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";

function InstructorClassesPage({ user }) {
  const [classrooms, setClassrooms] = useState([]);
  const [classroomId, setClassroomId] = useState("");
  const [classroomDetail, setClassroomDetail] = useState(null);
  // Instructor student enrollment form.
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [selectedEnrollIds, setSelectedEnrollIds] = useState([]);
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedGroupStudentIds, setSelectedGroupStudentIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPerPage, setRosterPerPage] = useState(10);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      setStatus("loading");
      try {
        const classroomResult = await fetchInstructorClassrooms();
        if (!isCurrent) return;
        setClassrooms(classroomResult.classrooms);
        setClassroomId(classroomResult.classrooms[0]?.id || "");
        setStatus("ready");
      } catch (loadError) {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load classrooms.");
        setStatus("error");
      }
    }
    load();
    return () => { isCurrent = false; };
  }, []);

  useEffect(() => {
    if (!classroomId) {
      return undefined;
    }
    let isCurrent = true;
    async function loadDetail() {
      try {
        const result = await fetchInstructorClassroom(classroomId);
        if (isCurrent) setClassroomDetail(result);
      } catch (detailError) {
        if (isCurrent) setError(detailError instanceof Error ? detailError.message : "Unable to load classroom details.");
      }
    }
    loadDetail();
    return () => { isCurrent = false; };
  }, [classroomId]);


  // Reset selections when changing classrooms.
  useEffect(() => {
    setIsEnrollOpen(false);
    setSelectedEnrollIds([]);
  }, [classroomId]);

  // Select or deselect an eligible student.
  function toggleEnrollment(studentId) {
    setSelectedEnrollIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  }

  // Register the selected students in the classroom.
  async function handleEnrollStudents(event) {
    event.preventDefault();

    if (!classroomId || !selectedEnrollIds.length) return;

    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const result = await enrollInstructorStudents(
        classroomId,
        selectedEnrollIds
      );

      // Refresh the roster after enrollment.
      const refreshed = await fetchInstructorClassroom(classroomId);

      setClassroomDetail(refreshed);
      setSelectedEnrollIds([]);
      setIsEnrollOpen(false);
      setNotice(result.message);

    } catch (enrollmentError) {
      setError(
        enrollmentError instanceof Error
          ? enrollmentError.message
          : "Unable to enroll students."
      );
    } finally {
      setIsSaving(false);
    }
  }


  function toggleGroupStudent(studentId) {
    setSelectedGroupStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  async function handleCreateGroup(event) {
    event.preventDefault();
    if (!classroomId) return;
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const result = await createInstructorClassroomGroup(classroomId, {
        name: groupName,
        studentIds: selectedGroupStudentIds,
      });
      const refreshedDetail = await fetchInstructorClassroom(classroomId);
      setClassroomDetail(refreshedDetail);
      setGroupName("");
      setSelectedGroupStudentIds([]);
      setIsGroupOpen(false);
      setNotice(result.message);
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : "Unable to create group.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleNewMember(studentId) {
    setSelectedNewMemberIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  async function handleAddMembers(event) {
    event.preventDefault();
    if (!selectedGroup) return;
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const result = await addInstructorGroupMembers(
        classroomId,
        selectedGroup.id,
        selectedNewMemberIds,
      );
      const refreshedDetail = await fetchInstructorClassroom(classroomId);
      setClassroomDetail(refreshedDetail);
      setSelectedNewMemberIds([]);
      setIsAddMembersOpen(false);
      setNotice(result.message);
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Unable to add group members.");
    } finally {
      setIsSaving(false);
    }
  }

  const classroom = classroomDetail?.classroom;
  const assignedGroupByStudent = new Map(
    (classroomDetail?.groups || []).flatMap((group) =>
      group.students.map((student) => [student.id, group.name]),
    ),
  );
  const selectedGroup = classroomDetail?.groups.find((group) => group.id === selectedGroupId);
  const visibleRoster = (classroomDetail?.students || []).slice(
    (rosterPage - 1) * rosterPerPage,
    rosterPage * rosterPerPage,
  );

  return (
    <div className="dashboard-page content-page instructor-workspace">
      <section className="page-heading">
        <div>
          <p className="section-label">Instructor workspace · classes</p>
          <h1><Icon name="calendar" size={25} /> Classes & case assignments</h1>
          <p>Review your assigned {user.subrole || "discipline"} classrooms, manage learning teams, and prepare students for scenarios.</p>
        </div>
        <span className="preview-label">Classrooms are created by administrators</span>
      </section>

      {(error || notice) && (
        <section className={`panel directory-action-message ${error ? "directory-error" : "directory-success"}`} role="status">
          {error || notice}
        </section>
      )}

      {!user.subrole && (
        <section className="panel discipline-notice">
          Your profile needs an assigned subrole before you can access assigned classrooms.
        </section>
      )}

      {status === "loading" && <section className="panel directory-loading">Loading classrooms…</section>}
      {status === "error" && !error && <section className="panel directory-error">Unable to load classrooms.</section>}

      {status === "ready" && !classrooms.length && (
        <section className="panel empty-state">
          <p className="section-label">No classrooms yet</p>
          <h2>No classrooms are assigned yet</h2>
          <p>Ask an administrator to create the classroom and assign you as its instructor.</p>
        </section>
      )}

      {classrooms.length > 0 && classroom && (
        <>
          <section className="panel class-selector">
            <div>
              <p className="section-label">Active classroom · {classroom.discipline}</p>
              <h2>{classroom.full_name}</h2>
              <p>{classroom.short_name} · CRN {classroom.crn} · {classroom.room || "Room not assigned"} · {classroom.term}</p>
            </div>
            <label>
              Switch classroom
              <select onChange={(event) => { setClassroomId(event.target.value); setRosterPage(1); }} value={classroomId}>
                {classrooms.map((item) => <option key={item.id} value={item.id}>{item.short_name}</option>)}
              </select>
            </label>
          </section>

          <section className="classes-layout">
            <article className="panel classroom-roster-panel">
              <div className="panel__header">
                <div><p className="section-label">Roster · {classroom.discipline}</p><h2>Enrolled learners</h2></div>
                <div className="panel__header-actions">
                  <span className="preview-label">{classroomDetail.students.length} active</span>
                  <button className="secondary-button" disabled={!classroomDetail.availableStudents.length} onClick={() => setIsEnrollOpen(true)} type="button"><Icon name="plus" size={15} /> Enroll learner</button>
                  <button className="secondary-button" disabled={!classroomDetail.students.length} onClick={() => setIsGroupOpen(true)} type="button"><Icon name="plus" size={15} /> Create group</button>
                </div>
              </div>
              {classroomDetail.students.length ? (
                <>
                  <div className="enrolled-student-list instructor-scroll-list">
                  {visibleRoster.map((student) => {
                    const groupNames = classroomDetail.groups
                      .filter((group) => group.students.some((member) => member.id === student.id))
                      .map((group) => group.name);
                    return (
                      <div key={student.id}>
                        <span>{student.name.split(" ").map((part) => part[0]).join("")}</span>
                        <div><strong>{student.name}</strong><small>{student.utepId ? `UTEP ID ${student.utepId}` : "UTEP ID not provided"}</small></div>
                        <em>{student.subrole}</em>
                        <b>{groupNames.length ? groupNames.join(", ") : "Not grouped"}</b>
                      </div>
                    );
                  })}
                  </div>
                  <Pagination currentPage={rosterPage} itemLabel="enrolled learners" onPageChange={setRosterPage} onPageSizeChange={(size) => { setRosterPerPage(size); setRosterPage(1); }} pageSize={rosterPerPage} totalItems={classroomDetail.students.length} />
                </>
              ) : <p className="directory-loading">No learners have been enrolled yet.</p>}
            </article>
            <article className="panel assignment-builder">
              <p className="section-label">Case assignments</p>
              <h2>Ready for scenario assignments</h2>
              <p className="assignment-builder__copy">This classroom and its matching-discipline roster are now real database records. Scenario assignment tables are the next step.</p>
              <button className="secondary-button" disabled type="button">Scenario tools coming next</button>
            </article>
          </section>


          {/* Derek: Instructor student enrollment form. */}
          {isEnrollOpen && (
            <section className="panel create-class-panel group-creation-panel">
              <div className="panel__header">
                <div>
                  <p className="section-label">Student enrollment</p>
                  <h2>Enroll eligible learners</h2>
                </div>

                <button
                  className="row-action"
                  aria-label="Close enrollment form"
                  onClick={() => setIsEnrollOpen(false)}
                  type="button"
                >
                  ×
                </button>
              </div>

              <form
                className="create-class-form"
                onSubmit={handleEnrollStudents}
              >
                <div>
                  <p className="create-class-form__hint">
                    Select students whose primary discipline is accepted by
                    this classroom.
                  </p>

                  <div className="eligible-learner-list">
                    {classroomDetail.availableStudents.map((student) => (
                      <label key={student.id}>
                        <input
                          type="checkbox"
                          checked={selectedEnrollIds.includes(student.id)}
                          onChange={() => toggleEnrollment(student.id)}
                        />

                        <span>{student.name}</span>
                        <small>{student.subrole}</small>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="admin-form__actions">
                  <button
                    className="secondary-button"
                    onClick={() => setIsEnrollOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>

                  <button
                    className="primary-button"
                    disabled={isSaving || !selectedEnrollIds.length}
                    type="submit"
                  >
                    {isSaving ? "Enrolling..." : "Enroll selected"}
                  </button>
                </div>
              </form>
            </section>
          )}


          <section className="panel group-overview-panel">
            <div className="panel__header">
              <div><p className="section-label">Classroom groups</p><h2>Learning teams</h2></div>
              <span className="preview-label">{classroomDetail.groups.length} groups</span>
            </div>
            {classroomDetail.groups.length ? (
              <div className="group-overview-list">
                {classroomDetail.groups.map((group) => (
                  <button
                    className={selectedGroupId === group.id ? "group-card group-card--selected" : "group-card"}
                    key={group.id}
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setIsAddMembersOpen(false);
                    }}
                    type="button"
                  >
                    <div><span>{group.name.slice(0, 1).toUpperCase()}</span><h3>{group.name}</h3><small>{group.students.length} members</small></div>
                    <p>{group.students.map((student) => student.name).join(" · ")}</p>
                  </button>
                ))}
              </div>
            ) : <p className="directory-loading">Create a group to organize your enrolled learners for shared scenarios.</p>}
          </section>

          {selectedGroup && (
            <section className="group-detail-workspace">
              <article className="panel group-detail-panel">
                <div className="panel__header">
                  <div><p className="section-label">Selected learning team</p><h2>{selectedGroup.name}</h2></div>
                  <span className="preview-label">{selectedGroup.students.length} members</span>
                </div>
                <p className="group-detail-panel__intro">Review the team roster, add ungrouped learners, and prepare this team for a shared clinical scenario.</p>
                <div className="group-member-grid">
                  {selectedGroup.students.map((student) => (
                    <div key={student.id}>
                      <span>{student.name.split(" ").map((part) => part[0]).join("")}</span>
                      <div><strong>{student.name}</strong><small>{student.utepId ? `UTEP ID ${student.utepId}` : student.subrole}</small></div>
                    </div>
                  ))}
                </div>
                <button
                  className="secondary-button"
                  disabled={!classroomDetail.students.some((student) => !assignedGroupByStudent.has(student.id))}
                  onClick={() => setIsAddMembersOpen(true)}
                  type="button"
                >
                  Add registered members
                </button>
              </article>
              <article className="panel group-assignment-panel">
                <p className="section-label">Scenario workspace</p>
                <h2>Plan a group assignment</h2>
                <p>The group is ready for a shared scenario. We will connect this workspace to the clinical-case source after we add durable assignment and per-student encounter tables.</p>
                <div className="assignment-readiness">
                  <span>1</span><div><strong>Group roster ready</strong><small>{selectedGroup.students.length} registered learners</small></div>
                  <span>2</span><div><strong>Select a case</strong><small>Next database integration</small></div>
                  <span>3</span><div><strong>Release to learners</strong><small>Creates individual encounter records</small></div>
                </div>
              </article>
            </section>
          )}

          {selectedGroup && isAddMembersOpen && (
            <section className="panel create-class-panel group-creation-panel">
              <div className="panel__header">
                <div><p className="section-label">Update {selectedGroup.name}</p><h2>Add registered members</h2></div>
                <button aria-label="Close member form" className="row-action" onClick={() => setIsAddMembersOpen(false)} type="button">×</button>
              </div>
              <form className="create-class-form" onSubmit={handleAddMembers}>
                <div>
                  <p className="create-class-form__hint">Only currently ungrouped students are available.</p>
                  <div className="eligible-learner-list">
                    {classroomDetail.students.filter((student) => !assignedGroupByStudent.has(student.id)).map((student) => (
                      <label key={student.id}>
                        <input checked={selectedNewMemberIds.includes(student.id)} onChange={() => toggleNewMember(student.id)} type="checkbox" />
                        <span>{student.name}</span>
                        <small>{student.subrole}</small>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="admin-form__actions">
                  <button className="secondary-button" onClick={() => setIsAddMembersOpen(false)} type="button">Cancel</button>
                  <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "Adding…" : "Add members"}</button>
                </div>
              </form>
            </section>
          )}

          {isGroupOpen && (
            <section className="panel create-class-panel group-creation-panel">
              <div className="panel__header">
                <div><p className="section-label">New learning team</p><h2>Create a student group</h2></div>
                <button aria-label="Close group form" className="row-action" onClick={() => setIsGroupOpen(false)} type="button">×</button>
              </div>
              <form className="create-class-form" onSubmit={handleCreateGroup}>
                <label>
                  Group name
                  <input onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Team Blue" required value={groupName} />
                </label>
                <div>
                  <p className="section-label">Registered students</p>
                  <p className="create-class-form__hint">Only students enrolled in <strong>{classroom.short_name}</strong> can join this group.</p>
                  <div className="eligible-learner-list">
                    {classroomDetail.students.map((student) => (
                      <label
                        className={assignedGroupByStudent.has(student.id) ? "eligible-learner-list__assigned" : ""}
                        key={student.id}
                      >
                        <input
                          checked={selectedGroupStudentIds.includes(student.id)}
                          disabled={assignedGroupByStudent.has(student.id)}
                          onChange={() => toggleGroupStudent(student.id)}
                          type="checkbox"
                        />
                        <span>{student.name}</span>
                        <small>
                          {assignedGroupByStudent.has(student.id)
                            ? `Already in ${assignedGroupByStudent.get(student.id)}`
                            : student.subrole}
                        </small>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="admin-form__actions">
                  <button className="secondary-button" onClick={() => setIsGroupOpen(false)} type="button">Cancel</button>
                  <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "Creating…" : "Create group"}</button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default InstructorClassesPage;
