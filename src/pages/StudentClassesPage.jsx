import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchStudentClasses } from "../lib/api";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";

function StudentClassesPage() {
  const navigate = useNavigate(); 
  const [classes, setClasses] = useState([]);
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [classPage, setClassPage] = useState(1);
  const [classesPerPage, setClassesPerPage] = useState(10);

  useEffect(() => {
    let ignore = false;

    fetchStudentClasses()
      .then((data) => {
        if (ignore) return;
        setClasses(data);
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
  }, []);
  
  // temporary handle route to billing and frontdesk

  const handleOpenClassroom = (classroom) => {
    
    if (classroom.discipline_subrole_id === 11) {
      navigate("/student/billing"); 
    } else if (classroom.discipline_subrole_id === 10) {
      navigate("/student/frontdesk"); 
    } else {
      navigate(`/student/class?id=${classroom.id}`);
    }
  };

  const classesByTerm = useMemo(() => Object.entries(classes.reduce((totals, classroom) => {
    const term = classroom.term || "Unscheduled";
    totals[term] = (totals[term] || 0) + 1;
    return totals;
  }, {})).map(([term, count]) => ({ term, count })), [classes]);
  const groupedClasses = classes.filter((classroom) => classroom.group).length;
  const visibleClasses = classes.slice((classPage - 1) * classesPerPage, classPage * classesPerPage);

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">My classes</p>
          <h1><Icon name="chart" size={25} /> My classes</h1>
          <p>The classes you are enrolled in and the group you belong to.</p>
        </div>
      </section>

      <section className="panel data-panel">
        {status === "ready" && classes.length > 0 && (
          <div className="student-classes-summary">
            <article className="student-summary-card"><span className="student-summary-card__icon"><Icon name="calendar" size={18} /></span><div><span>Enrolled classes</span><strong>{classes.length}</strong><small>Current academic enrollments</small></div></article>
            <article className="student-summary-card"><span className="student-summary-card__icon student-summary-card__icon--mint"><Icon name="patients" size={18} /></span><div><span>Group placements</span><strong>{groupedClasses}</strong><small>Classes with a group assigned</small></div></article>
            <article className="student-summary-chart"><div><p className="section-label">Enrollment load</p><h2>Classes by term</h2></div><div className="student-summary-chart__canvas"><ResponsiveContainer height="100%" width="100%"><BarChart data={classesByTerm} margin={{ left: -20, right: 4, top: 10 }}><CartesianGrid stroke="#edf0f5" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="term" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => [`${value} classes`, "Count"]} /><Bar dataKey="count" fill="#6277d8" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></article>
          </div>
        )}
        {status === "loading" && <p>Loading your classes...</p>}
        {status === "error" && <p role="alert">{errorMessage}</p>}
        {status === "ready" && classes.length === 0 && (
          <p>You are not enrolled in any classes yet.</p>
        )}
        {status === "ready" && classes.length > 0 && (
          <div className="table-wrap admin-scroll-table">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>CRN</th>
                  <th>Room</th>
                  <th>Term</th>
                  <th>Group</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleClasses.map((classroom) => (
                  <tr key={classroom.id}>
                    <td>
                      <strong>{classroom.full_name}</strong>
                      <small>{classroom.short_name}</small>
                    </td>
                    <td>{classroom.crn}</td>
                    <td>{classroom.room || "Not set"}</td>
                    <td>{classroom.term}</td>
                    <td>{classroom.group || "No group yet"}</td>
                    <td>
                        <button
                            aria-label={`Open ${classroom.full_name}`}
                            className="row-action"
                            onClick={() => handleOpenClassroom(classroom)}
                            type="button"
                        >
                            Details
                        </button>
                        </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {status === "ready" && classes.length > 0 && <Pagination currentPage={classPage} itemLabel="classes" onPageChange={setClassPage} onPageSizeChange={(size) => { setClassesPerPage(size); setClassPage(1); }} pageSize={classesPerPage} totalItems={classes.length} />}
      </section>
    </div>
  );
}

export default StudentClassesPage;
