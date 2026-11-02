import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchPatientCareTeam } from "../lib/api";

function PatientCareTeamPage({ user }) {
  const [careTeam, setCareTeam] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamPage, setTeamPage] = useState(1);
  const [teamPerPage, setTeamPerPage] = useState(6);

  useEffect(() => {
    let isCurrent = true;
    async function loadCareTeam() {
      try {
        setIsLoading(true);
        const result = await fetchPatientCareTeam();
        if (isCurrent) setCareTeam(result);
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load care team.",
          );
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    loadCareTeam();
    return () => {
      isCurrent = false;
    };
  }, []);

  const disciplineData = useMemo(() => {
    const totals = careTeam.reduce((counts, member) => {
      const discipline = member.subrole?.name || "Care Provider";
      counts[discipline] = (counts[discipline] || 0) + 1;
      return counts;
    }, {});
    return Object.entries(totals).map(([name, members]) => ({ name, members }));
  }, [careTeam]);
  const visibleCareTeam = careTeam.slice((teamPage - 1) * teamPerPage, teamPage * teamPerPage);

  if (isLoading) {
    return (
      <div className="dashboard-page content-page">
        <p className="directory-loading">Loading your care team…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page content-page">
        <section className="panel directory-error">{error}</section>
      </div>
    );
  }

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">My health</p>
          <h1><Icon name="patients" size={25} /> Care Team</h1>
          <p>Physicians, nurses, and clinical staff assigned to your care.</p>
        </div>
      </section>

      {careTeam.length === 0 ? (
        <section className="panel" style={{ padding: "30px", textAlign: "center" }}>
          <p className="empty-list-message">No care team members assigned yet.</p>
        </section>
      ) : (
        <>
          <section className="panel patient-chart-card">
            <div className="panel__header"><div><p className="section-label">Team composition</p><h2>Care disciplines</h2></div><Icon name="chart" size={19} /></div>
            <div className="patient-chart-canvas patient-chart-canvas--bar"><ResponsiveContainer height="100%" width="100%"><BarChart data={disciplineData} layout="vertical" margin={{ left: 4, right: 8, top: 8 }}><CartesianGrid horizontal={false} stroke="#edf0f5" /><XAxis allowDecimals={false} type="number" /><YAxis dataKey="name" tick={{ fontSize: 12 }} type="category" width={100} /><Tooltip formatter={(value) => [`${value} team members`, "Assigned"]} /><Bar dataKey="members" fill="#45bca2" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div>
          </section>
          <section className="team-grid patient-scroll-grid" style={{ marginTop: "24px" }}>
          {visibleCareTeam.map((member, index) => {
            const provider = member.provider || {};
            const firstName = provider.first_name || "Assigned";
            const lastName = provider.last_name || "Provider";
            const fullName = `Dr. ${firstName} ${lastName}`.trim();
            const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
            const subroleName = member.subrole?.name || "Care Provider";
            const avatarColorClass = index % 2 === 0 ? "team-avatar--teal" : "team-avatar--purple";

            return (
              <article className="panel team-card" key={member.id}>
                <div className={`team-avatar ${avatarColorClass}`}>
                  {initials || "DR"}
                </div>
                
                {member.is_primary ? (
                  <span className="preview-label" style={{ marginBottom: "10px", display: "inline-block" }}>
                    Primary Provider
                  </span>
                ) : (
                  <p className="section-label">{subroleName}</p>
                )}

                <h2>{fullName}</h2>
                <p>Role: {subroleName}</p>
                
                
                
              </article>
            );
          })}
          </section>
          <Pagination currentPage={teamPage} itemLabel="care team members" onPageChange={setTeamPage} onPageSizeChange={(size) => { setTeamPerPage(size); setTeamPage(1); }} pageSize={teamPerPage} totalItems={careTeam.length} />
        </>
      )}
    </div>
  );
}

export default PatientCareTeamPage;
