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
import { bulkCreatePatients, fetchAdminPatients } from "../lib/api";

function parsePatients(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [firstName = "", lastName = "", utepId = ""] = line
        .split(",")
        .map((item) => item.trim());

      return { firstName, lastName, utepId };
    });
}

function AdminPatientsPage() {
  const navigate = useNavigate();

  // Stores all Patient accounts returned from Supabase.
  const [patients, setPatients] = useState([]);

  // Stores what the Admin types into the search box.
  const [searchText, setSearchText] = useState("");
  const [patientPage, setPatientPage] = useState(1);
  const [patientsPerPage, setPatientsPerPage] = useState(10);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState("");
  const [temporaryCredentials, setTemporaryCredentials] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState("");

  // Helps us show a loading message while waiting for Supabase.
  const [isLoading, setIsLoading] = useState(true);

  // Stores an error message if the API request fails.
  const [error, setError] = useState("");

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

  // Load the patients when this page first opens.
  useEffect(() => {
    loadPatients();
  }, []);

  async function handleBulkCreate(event) {
    event.preventDefault();
    setIsSaving(true);
    setActionNotice("");
    setError("");

    try {
      const result = await bulkCreatePatients(parsePatients(bulkRows));
      setTemporaryCredentials(result.created || []);
      setActionNotice(result.message);
      setBulkRows("");
      await loadPatients();

      if (!result.failed?.length) {
        setIsBulkOpen(false);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to create patient accounts.",
      );
    } finally {
      setIsSaving(false);
    }
  }

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
        <button
          className="primary-button directory-create-button"
          onClick={() => setIsBulkOpen(true)}
          type="button"
        >
          <Icon name="plus" size={16} /> Bulk add patients
        </button>
      </section>

      {(actionNotice || temporaryCredentials.length > 0) && (
        <section className="panel directory-action-message directory-success" role="status">
          {actionNotice}
        </section>
      )}

      {temporaryCredentials.length > 0 && (
        <section className="panel temporary-credentials-panel">
          <div className="panel__header">
            <div>
              <p className="section-label">One-time secure handoff</p>
              <h2>Temporary patient passwords</h2>
            </div>
            <button
              aria-label="Hide temporary passwords"
              className="row-action"
              onClick={() => setTemporaryCredentials([])}
              type="button"
            >
              ×
            </button>
          </div>
          <p>
            Record these now. Careflow cannot display these passwords again after this panel is closed or refreshed.
          </p>
          <div className="temporary-credentials-list">
            {temporaryCredentials.map((credential) => (
              <div key={credential.id}>
                <span>
                  <strong>{credential.name}</strong>
                  <small>{credential.email}</small>
                </span>
                <code>{credential.temporaryPassword}</code>
              </div>
            ))}
          </div>
        </section>
      )}

      {isBulkOpen && (
        <section className="panel admin-academics-form-panel">
          <div className="panel__header">
            <div>
              <p className="section-label">Patient provisioning</p>
              <h2>Create patient accounts in bulk</h2>
            </div>
            <button
              aria-label="Close bulk patient form"
              className="row-action"
              onClick={() => setIsBulkOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>
          <form className="bulk-student-form" onSubmit={handleBulkCreate}>
            <label>
              Patient rows
              <span>One per line: First name, Last name, UTEP ID (optional)</span>
              <textarea
                onChange={(event) => setBulkRows(event.target.value)}
                placeholder={"Jane, Doe, 80123456\nJohn, Doe, 80123457"}
                required
                value={bulkRows}
              />
            </label>
            <p className="bulk-student-form__hint">
              Careflow creates unique <strong>first.last.123456@careflow.test</strong> patient accounts with a temporary password shown once after creation.
            </p>
            <div className="admin-form__actions">
              <button className="secondary-button" onClick={() => setIsBulkOpen(false)} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? "Creating accounts…" : "Create patient accounts"}
              </button>
            </div>
          </form>
        </section>
      )}

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
                onPageSizeChange={(nextPageSize) => {
                  setPatientsPerPage(nextPageSize);
                  setPatientPage(1);
                }}
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
