import { useEffect, useState } from "react";
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

function StudentClassDetailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const classroomId = searchParams.get("id");

  const [classroom, setClassroom] = useState(null);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");

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

            <section className="panel class-detail__card">
            <p className="section-label"><Icon name="chart" size={14} /> Cases</p>
            <h2>Cases for this class</h2>
            <p className="class-detail__note">
                Cases assigned in this class will appear here once they are linked to
                the class.
            </p>
            </section>
        </div>
        )}
    </div>
  );
}

export default StudentClassDetailPage;
