
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

  const [medicationStatuses, setMedicationStatuses] = useState({});
  const [medicationNotes, setMedicationNotes] = useState({});
  const [medicationDetails, setMedicationDetails] = useState({});

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

  function getMedicationName(med) {
    if (typeof med === "string") return med;

    return (
      med?.name ||
      med?.medication_name ||
      med?.drug_name ||
      "Unnamed medication"
    );
  }

  function getMedicationDetails(med) {
    if (typeof med === "string") return "";

    return [
      med?.dose || med?.dosage || med?.strength,
      med?.route,
      med?.frequency,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function updateMedicationStatus(index, status) {
    setMedicationStatuses((previous) => ({
      ...previous,
      [index]: status,
    }));
  }

  function updateMedicationNote(index, value) {
    setMedicationNotes((previous) => ({
      ...previous,
      [index]: value,
    }));
  }

  function updateDrugDetail(rxcui, field, value) {
    setMedicationDetails((previous) => ({
      ...previous,
      [rxcui]: {
        ...previous[rxcui],
        [field]: value,
      },
    }));
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
            <h3>Medication Reconciliation</h3>

            <p className="case-help-text">
              Review medications documented in the patient's chart
              and compare them with what the patient reports taking.
            </p>

            {/* SUMMARY */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(120px, 1fr))",
                gap: 12,
                margin: "20px 0",
              }}
            >
              <div className="panel">
                <strong>
                  {Array.isArray(medications)
                    ? medications.length
                    : 0}
                </strong>
                <p className="case-help-text">Chart medications</p>
              </div>

              <div className="panel">
                <strong>
                  {Array.isArray(medications)
                    ? medications.filter(
                        (_, i) =>
                          medicationStatuses[i] === "verified"
                      ).length
                    : 0}
                </strong>
                <p className="case-help-text">Verified</p>
              </div>

              <div className="panel">
                <strong>
                  {Array.isArray(medications)
                    ? medications.filter(
                        (_, i) =>
                          medicationStatuses[i] === "not-taking"
                      ).length
                    : 0}
                </strong>
                <p className="case-help-text">Not taking</p>
              </div>

              <div className="panel">
                <strong>
                  {Array.isArray(medications)
                    ? medications.filter(
                        (_, i) =>
                          medicationStatuses[i] === "review"
                      ).length
                    : 0}
                </strong>
                <p className="case-help-text">Needs review</p>
              </div>
            </div>

            {/* CHART MEDICATIONS */}
            <h3>Current Chart Medications</h3>

            {!Array.isArray(medications) ||
            medications.length === 0 ? (
              <p className="case-help-text">
                No medications recorded in the patient chart.
              </p>
            ) : (
              medications.map((med, index) => {
                const status = medicationStatuses[index];

                return (
                  <div
                    key={index}
                    style={{
                      border: "1px solid #dbe3ed",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong>{getMedicationName(med)}</strong>

                      </div>

                      <span className="case-help-text">
                        {status === "verified"
                          ? "Verified"
                          : status === "not-taking"
                          ? "Not taking"
                          : status === "review"
                          ? "Needs review"
                          : "Not reviewed"}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginTop: 12,
                      }}
                    >
                      <button
                        type="button"
                        className={
                          status === "verified"
                            ? "primary-button"
                            : "secondary-button"
                        }
                        onClick={() =>
                          updateMedicationStatus(index, "verified")
                        }
                      >
                        Verify
                      </button>

                      <button
                        type="button"
                        className={
                          status === "not-taking"
                            ? "primary-button"
                            : "secondary-button"
                        }
                        onClick={() =>
                          updateMedicationStatus(index, "not-taking")
                        }
                      >
                        Not Taking
                      </button>

                      <button
                        type="button"
                        className={
                          status === "review"
                            ? "primary-button"
                            : "secondary-button"
                        }
                        onClick={() =>
                          updateMedicationStatus(index, "review")
                        }
                      >
                        Needs Review
                      </button>
                    </div>

                    <textarea
                      value={medicationNotes[index] || ""}
                      onChange={(event) =>
                        updateMedicationNote(
                          index,
                          event.target.value
                        )
                      }
                      placeholder="Document patient-reported information or discrepancies..."
                      rows={2}
                      style={{
                        width: "100%",
                        marginTop: 12,
                        padding: 10,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                );
              })
            )}

            {/* RXNORM SEARCH */}
            <hr style={{ margin: "24px 0" }} />

            <h3>Add Medication</h3>

            <p className="case-help-text">
              Search RxNorm to find medications that the patient
              reports taking.
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
                onChange={(event) =>
                  setSearch(event.target.value)
                }
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
                disabled={
                  searching || search.trim().length < 2
                }
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </form>

            {searchError && (
              <p role="alert" className="case-help-text">
                {searchError}
              </p>
            )}

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
                        (item) =>
                          item.rxcui === drug.rxcui
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
                              {isSelected
                                ? "Selected"
                                : "Select"}
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

            {/* ADDITIONAL MEDICATIONS */}
            <h3 style={{ marginTop: 24 }}>
              Additional Medications ({selectedDrugs.length})
            </h3>

            {selectedDrugs.length === 0 ? (
              <p className="case-help-text">
                No additional medications selected.
              </p>
            ) : (
              selectedDrugs.map((drug) => {
                const details =
                  medicationDetails[drug.rxcui] || {};

                return (
                  <div
                    key={drug.rxcui}
                    style={{
                      border: "1px solid #dbe3ed",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong>{drug.name}</strong>
                        <p className="case-help-text">
                          RxCUI: {drug.rxcui}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() =>
                          removeDrug(drug.rxcui)
                        }
                      >
                        Remove
                      </button>
                    </div>

                    {/* MEDICATION DETAILS */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 12,
                        marginTop: 12,
                      }}
                    >
                      <div>
                        <label>Dose / Strength</label>
                        <input
                          value={details.dose || ""}
                          onChange={(event) =>
                            updateDrugDetail(
                              drug.rxcui,
                              "dose",
                              event.target.value
                            )
                          }
                          placeholder="e.g. 500 mg"
                          style={{
                            width: "100%",
                            padding: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label>Route</label>
                        <input
                          value={details.route || ""}
                          onChange={(event) =>
                            updateDrugDetail(
                              drug.rxcui,
                              "route",
                              event.target.value
                            )
                          }
                          placeholder="e.g. Oral"
                          style={{
                            width: "100%",
                            padding: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label>Frequency</label>
                        <input
                          value={details.frequency || ""}
                          onChange={(event) =>
                            updateDrugDetail(
                              drug.rxcui,
                              "frequency",
                              event.target.value
                            )
                          }
                          placeholder="e.g. Twice daily"
                          style={{
                            width: "100%",
                            padding: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div>
                        <label>Source</label>
                        <select
                          value={
                            details.source || "patient"
                          }
                          onChange={(event) =>
                            updateDrugDetail(
                              drug.rxcui,
                              "source",
                              event.target.value
                            )
                          }
                          style={{
                            width: "100%",
                            padding: 8,
                            boxSizing: "border-box",
                          }}
                        >
                          <option value="patient">
                            Patient
                          </option>
                          <option value="caregiver">
                            Caregiver
                          </option>
                          <option value="medication-list">
                            Medication List
                          </option>
                          <option value="other">
                            Other
                          </option>
                        </select>
                      </div>
                    </div>

                    <textarea
                      value={details.notes || ""}
                      onChange={(event) =>
                        updateDrugDetail(
                          drug.rxcui,
                          "notes",
                          event.target.value
                        )
                      }
                      placeholder="Additional medication notes..."
                      rows={2}
                      style={{
                        width: "100%",
                        marginTop: 12,
                        padding: 10,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                );
              })
            )}


        {/* VIEW SELECTED MEDICATIONS */}
            <button
              type="button"
              className="primary-button"
              onClick={() => setActiveSection("interactions")}
              disabled={selectedDrugs.length === 0}
              style={{ marginTop: 16 }}
            >
              View Selected Medications ({selectedDrugs.length}) →
            </button>
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
                <strong>
                  Lexidrug Interaction Checker
                </strong>
                <p
                  style={{
                    margin: "5px 0 0",
                    fontSize: 13,
                    color: "#64748b",
                  }}
                >
                  Check medication interactions using
                  UTEP's institutional access.
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

            
            {/* PATIENT ALLERGIES */}
            <div style={{ marginTop: 24 }}>
              <h3>Patient Allergies</h3>

              {Array.isArray(patient?.allergies) && patient.allergies.length > 0 ? (
                <ul>
                  {patient.allergies.map((allergy, index) => (
                    <li key={index}>
                      {typeof allergy === "string"
                        ? allergy
                        : allergy.name || allergy.substance || "Unknown allergy"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="case-help-text">
                  No allergies documented.
                </p>
              )}
            </div>
              


            {/* SELECTED MEDICATIONS */}
            <div style={{ marginTop: 24 }}>
              <h3>
                Selected Medications ({selectedDrugs.length})
              </h3>

              <p className="case-help-text">
                Medications selected during Medication
                Reconciliation.
              </p>

              {selectedDrugs.length === 0 ? (
                <p className="case-help-text">
                  No medications selected.
                </p>
              ) : (
                selectedDrugs.map((drug) => {
                  const details =
                    medicationDetails[drug.rxcui] || {};

                  return (
                    <div
                      key={drug.rxcui}
                      style={{
                        border: "1px solid #dbe3ed",
                        borderRadius: 10,
                        padding: 16,
                        marginBottom: 12,
                      }}
                    >
                      <strong>{drug.name}</strong>

                      <p className="case-help-text">
                        RxCUI: {drug.rxcui}
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: 12,
                          marginTop: 12,
                        }}
                      >
                        <div>
                          <strong>
                            Dose / Strength
                          </strong>
                          <p>
                            {details.dose ||
                              "Not documented"}
                          </p>
                        </div>

                        <div>
                          <strong>Route</strong>
                          <p>
                            {details.route ||
                              "Not documented"}
                          </p>
                        </div>

                        <div>
                          <strong>Frequency</strong>
                          <p>
                            {details.frequency ||
                              "Not documented"}
                          </p>
                        </div>

                        <div>
                          <strong>Source</strong>
                          <p>
                            {details.source ||
                              "patient"}
                          </p>
                        </div>
                      </div>

                      {details.notes && (
                        <div style={{ marginTop: 12 }}>
                          <strong>Notes</strong>
                          <p>{details.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* CURRENT CHART MEDICATIONS */}
            <div style={{ marginTop: 24 }}>
              <h3>
                Current Chart Medications ({Array.isArray(medications) ? medications.length : 0})
              </h3>

              {!Array.isArray(medications) || medications.length === 0 ? (
                <p className="case-help-text">
                  No medications recorded in the patient chart.
                </p>
              ) : (
                medications.map((med, index) => (
                  <div
                    key={index}
                    style={{
                      border: "1px solid #dbe3ed",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    <strong>{getMedicationName(med)}</strong>


                    <p className="case-help-text">
                      Status:{" "}
                      {medicationStatuses[index] === "verified"
                        ? "Verified"
                        : medicationStatuses[index] === "not-taking"
                        ? "Not Taking"
                        : medicationStatuses[index] === "review"
                        ? "Needs Review"
                        : "Not Reviewed"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
