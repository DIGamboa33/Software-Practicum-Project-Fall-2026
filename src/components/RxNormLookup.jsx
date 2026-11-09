import { useState } from "react";
import { searchRxNormDrugs } from "../lib/api";

export default function RxNormLookup() {
  const [name, setName] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function search(event) {
    event.preventDefault();
    const query = name.trim();
    if (query.length < 2 || loading) return;

    setLoading(true);
    setError("");
    setResults([]);
    setSearched(false);

    try {
      const data = await searchRxNormDrugs(query);
      setResults(Array.isArray(data.drugs) ? data.drugs : []);
      setSearched(true);
    } catch (err) {
      setError(err.message || "Unable to search RxNorm.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel data-panel case-section" style={{ marginTop: 12 }}>
      <div className="case-section-heading"><h2>RxNorm Drug Lookup</h2></div>
      <p className="case-help-text">
        Look up standardized drug names, strengths, forms and RxCUI codes.
        This does not modify the patient's medications or check interactions.
      </p>
      <form onSubmit={search} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <input
          aria-label="Medication name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g., metformin, Lipitor"
          minLength={2}
          maxLength={100}
          required
          style={{ flex: "1 1 220px", minWidth: 0, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <button type="submit" className="primary-button" disabled={loading || name.trim().length < 2}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {searched && results.length === 0 && <p role="status">No drug products found. Try a generic ingredient or brand name.</p>}
      {results.length > 0 && (
        <>
          <p className="case-help-text" role="status">
            Showing {results.length} RxNorm products. Select the appropriate strength and dosage form from the results.
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Drug name / strength / form</th><th scope="col">RxCUI</th><th scope="col">Type</th></tr></thead>
              <tbody>
                {results.map((drug) => (
                  <tr key={drug.rxcui}>
                    <td>{drug.name}</td>
                    <td>{drug.rxcui}</td>
                    <td>{drug.tty === "SBD" ? "Branded drug" : drug.tty === "SCD" ? "Clinical drug" : drug.tty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="case-help-text">
        Educational lookup using the U.S. National Library of Medicine RxNorm terminology.
        Not a prescribing or clinical decision-support tool.
      </p>
    </section>
  );
}
