
import { useEffect, useMemo, useState } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchStudentCases } from "../lib/api";

function StudentOverviewPage({ user, onNavigate }) {
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [casesError, setCasesError] = useState("");
  const [hoveredCaseId, setHoveredCaseId] = useState(null);
  const [casePage, setCasePage] = useState(1);
  const [casesPerPage, setCasesPerPage] = useState(10);

  const firstName = user?.name?.split(" ")[0] || "Student";
  const caseStatusData = useMemo(() => {
    const totals = cases.reduce((counts, patientCase) => {
      const status = patientCase.encounter_status || "Not started";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    }, {});
    return Object.entries(totals).map(([name, value]) => ({ name, value }));
  }, [cases]);
  const activeCases = cases.filter((patientCase) => !["Checked out", "Completed"].includes(patientCase.encounter_status)).length;
  const visibleCases = cases.slice((casePage - 1) * casesPerPage, casePage * casesPerPage);

  useEffect(() => {
    let isCurrent = true;

    async function loadCases() {
      try {
        setCasesLoading(true);
        setCasesError("");

        const data = await fetchStudentCases();

        if (isCurrent) {
          setCases(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (isCurrent) {
          setCasesError(
            error.message || "Unable to load your assigned cases."
          );
        }
      } finally {
        if (isCurrent) {
          setCasesLoading(false);
        }
      }
    }

    loadCases();

    return () => {
      isCurrent = false;
    };
  }, []);

  function openCase(patientCase) {
    onNavigate("caseDetail", {
      caseId: patientCase.id,
    });
  }

  if (casesLoading) {
    return (
      <div className="dashboard-page content-page">
        <p role="status">Loading cases...</p>
      </div>
    );
  }

  if (casesError) {
    return (
      <div className="dashboard-page content-page">
        <p role="alert">{casesError}</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">My cases</p>

          <h1>Welcome back, {firstName}</h1>

          <p>
            Review your assigned patient scenarios and documentation.
          </p>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="student-dashboard-summary">
          <article className="student-summary-card"><span className="student-summary-card__icon"><Icon name="patients" size={18} /></span><div><span>Assigned cases</span><strong>{cases.length}</strong><small>Available learning scenarios</small></div></article>
          <article className="student-summary-card"><span className="student-summary-card__icon student-summary-card__icon--mint"><Icon name="chart" size={18} /></span><div><span>In progress</span><strong>{activeCases}</strong><small>Encounters still underway</small></div></article>
          <article className="student-summary-chart">
            <div><p className="section-label">Case progress</p><h2>Status mix</h2></div>
            {caseStatusData.length ? <div className="student-summary-chart__canvas"><ResponsiveContainer height="100%" width="100%"><PieChart><Pie data={caseStatusData} dataKey="value" innerRadius={34} nameKey="name" outerRadius={53} paddingAngle={3}>{caseStatusData.map((item, index) => <Cell fill={["#6277d8", "#45bca2", "#f0a650", "#a175d8"][index % 4]} key={item.name} />)}</Pie><Tooltip formatter={(value) => [`${value} cases`, "Count"]} /><Legend /></PieChart></ResponsiveContainer></div> : <p className="directory-loading">No case data yet.</p>}
          </article>
        </div>

        <div className="student-case-table-heading"><div><p className="section-label">Learning workspace</p><h2>Assigned patient cases</h2></div><span>{cases.length} total</span></div>
        {cases.length === 0 ? (
          <p
            style={{
              padding: "24px",
              color: "#64748b",
            }}
          >
            No cases have been assigned to you yet.
          </p>
        ) : (
          <div
            className="table-wrap admin-scroll-table"
            style={{
              width: "100%",
              maxWidth: "100%",
              overflowX: "auto",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 0,
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "32%" }} />
                <col style={{ width: "43%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "5%" }} />
              </colgroup>

              <thead>
                <tr>
                  <th scope="col">Case</th>
                  <th scope="col">Chief complaint</th>
                  <th scope="col">Encounter status</th>
                  <th
                    scope="col"
                    aria-label="Open case"
                    style={{
                      position: "sticky",
                      right: 0,
                      backgroundColor: "#fff",
                      zIndex: 2,
                    }}
                  />
                </tr>
              </thead>

              <tbody>
                {visibleCases.map((patientCase) => {
                  const isHovered =
                    hoveredCaseId === patientCase.id;

                  const rowBackground = isHovered
                    ? "#f1f5f9"
                    : "#fff";

                  return (
                    <tr
                      key={patientCase.id}
                      onClick={() => openCase(patientCase)}
                      onKeyDown={(event) => {
                        if (
                          event.target !== event.currentTarget
                        ) {
                          return;
                        }

                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          openCase(patientCase);
                        }
                      }}
                      onMouseEnter={() =>
                        setHoveredCaseId(patientCase.id)
                      }
                      onMouseLeave={() =>
                        setHoveredCaseId(null)
                      }
                      onFocus={() =>
                        setHoveredCaseId(patientCase.id)
                      }
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget
                          )
                        ) {
                          setHoveredCaseId(null);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Open case for ${patientCase.patient_name}`}
                      style={{
                        cursor: "pointer",
                        backgroundColor: rowBackground,
                        transition:
                          "background-color 0.15s ease",
                      }}
                    >
                      {/* PATIENT NAME AND CASE TITLE */}
                      <td
                      style={{
                        whiteSpace: "normal",
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "1.125rem",
                            fontWeight: 700,
                            color: "#334155",
                            lineHeight: 1.4,
                          }}
                        >
                          {patientCase.patient_name}
                        </span>

                        <span
                          style={{
                            fontSize: "0.875rem",
                            fontWeight: 400,
                            color: "#64748b",
                            lineHeight: 1.4,
                          }}
                        >
                          {patientCase.title}
                        </span>
                      </div>
                    </td>

                      {/* CHIEF COMPLAINT */}
                      <td
                        style={{
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          verticalAlign: "middle",
                          lineHeight: 1.5,
                        }}
                      >
                        {patientCase.chief_complaint}
                      </td>

                      {/* ENCOUNTER STATUS */}
                      <td
                        style={{
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          verticalAlign: "middle",
                        }}
                      >
                        <span
                          className="status-badge"
                          style={{
                            display: "inline-block",
                            maxWidth: "100%",
                            whiteSpace: "normal",
                            overflowWrap: "anywhere",
                          }}
                        >
                          {patientCase.encounter_status ||
                            "Not started"}
                        </span>
                      </td>

                      {/* STICKY ARROW */}
                      <td
                        style={{
                          position: "sticky",
                          right: 0,
                          backgroundColor: rowBackground,
                          verticalAlign: "middle",
                          textAlign: "center",
                          padding: "8px 4px",
                          zIndex: 1,
                          transition:
                            "background-color 0.15s ease",
                        }}
                      >
                        <button
                          className="row-action"
                          type="button"
                          aria-label={`Open ${patientCase.patient_name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openCase(patientCase);
                          }}
                          style={{
                            cursor: "pointer",
                            transition:
                              "background-color 0.15s ease, color 0.15s ease",
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {cases.length > 0 && <Pagination currentPage={casePage} itemLabel="assigned cases" onPageChange={setCasePage} onPageSizeChange={(size) => { setCasesPerPage(size); setCasePage(1); }} pageSize={casesPerPage} totalItems={cases.length} />}
      </section>
    </div>
  );
}

export default StudentOverviewPage;
