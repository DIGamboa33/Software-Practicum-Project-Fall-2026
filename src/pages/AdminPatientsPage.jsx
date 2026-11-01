import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import { fetchAdminPatients } from "../lib/api";

function AdminPatientsPage() {
  const navigate = useNavigate();

  // Stores all Patient accounts returned from Supabase.
  const [patients, setPatients] = useState([]);

  // Stores what the Admin types into the search box.
  const [searchText, setSearchText] = useState("");
  const [patientPage, setPatientPage] = useState(1);

  // Helps us show a loading message while waiting for Supabase.
  const [isLoading, setIsLoading] = useState(true);

  // Stores an error message if the API request fails.
  const [error, setError] = useState("");

  // Load the patients when this page first opens.
  useEffect(() => {
    async function loadPatients() {
      try {
        setIsLoading(true);
        setError("");

        const patientData = await fetchAdminPatients();

        setPatients(patientData);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load patients.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadPatients();
  }, []);

  // Search through the patient list.
  function getFilteredPatients() {
    const matchingPatients = [];

    const lowerSearchText = searchText.toLowerCase();

    for (const patient of patients) {
      const patientName = (patient.name || "").toLowerCase();

      const patientEmail = (patient.email || "").toLowerCase();

      const careflowId = (patient.careflowId || "").toLowerCase();

      const patientId = (patient.id || "").toLowerCase();

      const nameMatches = patientName.includes(lowerSearchText);

      const emailMatches = patientEmail.includes(lowerSearchText);

      const careflowIdMatches = careflowId.includes(lowerSearchText);

      const idMatches = patientId.includes(lowerSearchText);

      if (
        nameMatches ||
        emailMatches ||
        careflowIdMatches ||
        idMatches
      ) {
        matchingPatients.push(patient);
      }
    }

    return matchingPatients;
  }

  const filteredPatients = getFilteredPatients();
  const patientStatusData = useMemo(() => {
    const activePatients = patients.filter((patient) => patient.isActive !== false).length;

    return [
      { name: "Active", value: activePatients },
      { name: "Inactive", value: patients.length - activePatients },
    ].filter((item) => item.value > 0);
  }, [patients]);
  const patientsPerPage = 10;
  const visiblePatients = filteredPatients.slice(
    (patientPage - 1) * patientsPerPage,
    patientPage * patientsPerPage,
  );

  function handleSearchChange(event) {
    setSearchText(event.target.value);
    setPatientPage(1);
  }

  function clearSearch() {
    setSearchText("");
    setPatientPage(1);
  }

  function getInitials(name) {
    if (!name) {
      return "PT";
    }

    const parts = name.split(" ");

    const firstInitial = parts[0]?.charAt(0) || "";
    const lastInitial = parts[1]?.charAt(0) || "";

    return `${firstInitial}${lastInitial}`.toUpperCase();
  }

  function formatDate(dateValue) {
    if (!dateValue) {
      return "Not available";
    }

    return new Date(dateValue).toLocaleDateString();
  }

  return (
    <div className="dashboard-page content-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Patient directory</p>

          <h1>Patients</h1>

          <p>
            Search Patient accounts currently stored in Careflow.
          </p>
        </div>
      </section>

      <section className="panel data-panel">
        <div className="data-panel__toolbar">
          <strong>
            {filteredPatients.length}{" "}
            {filteredPatients.length === 1 ? "patient" : "patients"}{" "}
          </strong>

          <label className="table-search">
            <Icon name="search" size={16} />

            <input
              placeholder="Search patients"
              type="search"
              value={searchText}
              onChange={handleSearchChange}
            />
          </label>

          {searchText !== "" && (
            <button
              className="outline-button"
              type="button"
              onClick={clearSearch}
            >
              Clear search
            </button>
          )}
        </div>

        {isLoading && (
          <p style={{ padding: "22px" }}>
            Loading patients...
          </p>
        )}

        {error && (
          <p style={{ padding: "22px" }}>
            {error}
          </p>
        )}

        {!isLoading && !error && (
          <>
            <div className="table-wrap admin-scroll-table">
              <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Careflow ID</th>
                  <th>Email</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filteredPatients.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      No patients found.
                    </td>
                  </tr>
                )}

                {visiblePatients.map((patient) => (
                  <tr key={patient.id}>
                    <td>
                      <span className="patient-avatar patient-avatar--blue">
                        {getInitials(patient.name)}
                      </span>

                      <div>
                        <strong>{patient.name || "Unnamed patient"}</strong>

                        <small>
                          Patient account
                        </small>
                      </div>
                    </td>

                    <td>
                      {patient.careflowId || "Not assigned"}
                    </td>

                    <td>
                      {patient.email || "Not available"}
                    </td>

                    <td>
                      {formatDate(patient.createdAt)}
                    </td>
                    <td>
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`View details for ${patient.name || "Unnamed patient"}`}
                        onClick={() => navigate(`/admin/patient?id=${patient.id}`)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <Pagination
              currentPage={patientPage}
              itemLabel="patients"
              onPageChange={setPatientPage}
              pageSize={patientsPerPage}
              totalItems={filteredPatients.length}
            />
          </>
        )}
      </section>

      {!isLoading && !error && (
        <section className="panel admin-visual-card admin-patient-status-card">
          <div className="panel__header">
            <div>
              <p className="section-label">Directory health</p>
              <h2>Patient account status</h2>
            </div>
            <span className="admin-visual-caption">All patient profiles</span>
          </div>
          {patientStatusData.length ? (
            <div className="admin-visual-canvas admin-visual-canvas--donut">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={patientStatusData}
                    dataKey="value"
                    innerRadius={58}
                    nameKey="name"
                    outerRadius={86}
                    paddingAngle={3}
                  >
                    <Cell fill="#45bca2" />
                    <Cell fill="#d87070" />
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} accounts`, "Patients"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="directory-loading">Account status will appear when patient profiles are added.</p>
          )}
        </section>
      )}
    </div>
  );
}

export default AdminPatientsPage;
