
import { useState } from "react";
import { searchRxNormMedications } from "../lib/api";

export default function StudentMedicationsPage({
  patient,
  medications,
  assignmentId,
}) {
  const [activeSection, setActiveSection] = useState("current");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedDrugs, setSelectedDrugs] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedTerm, setLastSearchedTerm] = useState("");

  const sections = [
    ["current", "Medication Reconciliation"],
    ["interactions", "Drug Interactions"],
  ];

  async function handleDrugSearch(event) {
    event.preventDefault();

    const searchTerm = search.trim();

    if (searchTerm.length < 2 || searching) return;

    setSearching(true);
    setSearchError("");
    setResults([]);
    setHasSearched(false);
    setLastSearchedTerm(searchTerm);

    try {
      const drugs = await searchRxNormMedications(searchTerm);

      if (!Array.isArray(drugs)) {
        throw new Error("Unexpected response from medication search.");
      }

      setResults(drugs);
      setHasSearched(true);
    } catch (error) {
      setSearchError(
        error.message || "Unable to search medications."
      );
    } finally {
      setSearching(false);
    }
  }

  function selectDrug(drug) {
    setSelectedDrugs((previous) =>
      previous.some((item) => item.rxcui === drug.rxcui)
        ? previous
        : [...previous, drug]
    );
  }

  function removeDrug(rxcui) {
    setSelectedDrugs((previous) =>
      previous.filter((item) => item.rxcui !== rxcui)
    );
  }

  return (
    <div className="student-medications-page">
      <section className="panel data-panel">
        <h2>Medication Management</h2>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {sections.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                activeSection === id
                  ? "primary-button"
                  : "secondary-button"
              }
              onClick={() => setActiveSection(id)}
            >
              {label}
            </button>
          ))}
        </div>


        {/* MEDICATION RECONCILIATION */}
        {activeSection === "current" && (
          <div>
            <h3>Current Medications</h3>

            {Array.isArray(medications) && medications.length > 0 ? (
              <ul>
                {medications.map((med, index) => (
                  <li key={index}>
                    {typeof med === "string"
                      ? med
                      : JSON.stringify(med)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No medications recorded.</p>
            )}

            <hr style={{ margin: "24px 0" }} />

            {/* RXNORM MEDICATION SEARCH */}
            <h3>Add Medication</h3>
            <p className="case-help-text">
              Search RxNorm to find medications that the patient reports
              taking but are missing from the existing medication list.
            </p>

            <form
              onSubmit={handleDrugSearch}
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search medication name"
                aria-label="Medication name"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 10,
                }}
              />

              <button
                type="submit"
                className="primary-button"
                disabled={searching || search.trim().length < 2}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </form>

            {/* SEARCH ERROR */}
            {searchError && (
              <p role="alert" className="case-help-text">
                {searchError}
              </p>
            )}

            {/* NO RESULTS */}
            {hasSearched &&
              results.length === 0 &&
              !searching &&
              !searchError && (
                <div
                  role="status"
                  style={{
                    padding: 16,
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <strong>No medications found.</strong>
                  <p>
                    No matching medications were found in RxNorm
                    for "{lastSearchedTerm}".
                  </p>
                  <p className="case-help-text">
                    Try checking the spelling or searching for a
                    generic medication name.
                  </p>
                </div>
              )}

            {/* SEARCH RESULTS */}
            {results.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th
                        style={{
                          position: "sticky",
                          left: 0,
                          background: "white",
                          zIndex: 2,
                        }}
                      >
                        Action
                      </th>
                      <th>Medication</th>
                      <th>RxCUI</th>
                      <th>Type</th>
                    </tr>
                  </thead>

                  <tbody>
                    {results.map((drug) => {
                      const isSelected = selectedDrugs.some(
                        (item) => item.rxcui === drug.rxcui
                      );

                      return (
                        <tr key={drug.rxcui}>
                          <td
                            style={{
                              position: "sticky",
                              left: 0,
                              background: "white",
                              zIndex: 1,
                            }}
                          >
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => selectDrug(drug)}
                              disabled={isSelected}
                              style={{
                                padding: "4px 8px",
                                fontSize: 12,
                                minWidth: "auto",
                              }}
                            >
                              {isSelected ? "Selected" : "Select"}
                            </button>
                          </td>

                          <td>{drug.name}</td>
                          <td>{drug.rxcui}</td>
                          <td>{drug.type}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* SELECTED MEDICATIONS */}
            <h3 style={{ marginTop: 24 }}>
              Additional Medications ({selectedDrugs.length})
            </h3>

            {selectedDrugs.length === 0 ? (
              <p className="case-help-text">
                No additional medications selected.
              </p>
            ) : (
              selectedDrugs.map((drug) => (
                <p key={drug.rxcui}>
                  {drug.name} — RxCUI {drug.rxcui}

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => removeDrug(drug.rxcui)}
                    style={{ marginLeft: 8 }}
                  >
                    Remove
                  </button>
                </p>
              ))
            )}
          </div>
        )}


        
        {/* DRUG INTERACTIONS */}
        {activeSection === "interactions" && (
          <div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: 16,
                marginTop: 16,
                border: "1px solid #dbe3ed",
                borderRadius: 10,
                background: "#f8fafc",
              }}
            >
              <div>
                <strong>Lexidrug Interaction Checker</strong>
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  Check medication interactions using UTEP's
                  institutional access.
                </p>
              </div>

              <a
                href="https://online-lexi-com.utep.idm.oclc.org/lco/action/interact?siteid=2"
                target="_blank"
                rel="noopener noreferrer"
                className="primary-button"
                style={{
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Open Lexidrug ↗
              </a>
            </div>
          </div>
        )}

      </section>
    </div>
  );
}
