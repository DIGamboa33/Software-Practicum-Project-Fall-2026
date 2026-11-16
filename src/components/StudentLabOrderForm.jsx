import { useEffect, useState } from "react";
import { fetchStudentLabOrders, createStudentLabOrder, deleteStudentLabOrder } from "../lib/api";

export default function StudentLabOrderForm({ assignmentId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    test_name: "",
    test_code: "",
    category: "Chemistry",
    clinical_indication: "",
    fasting_required: false,
    specimen_type: "Venous Blood",
    priority: "Routine",
    special_instructions: "",
  });

  useEffect(() => {
    let active = true;
    async function loadOrders() {
      if (!assignmentId) return;
      try {
        setLoading(true);
        const data = await fetchStudentLabOrders(assignmentId);
        if (active && Array.isArray(data)) {
          setOrders(data);
        }
      } catch (err) {
        if (active) setError(err.message || "Failed to load lab orders.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadOrders();
    return () => { active = false; };
  }, [assignmentId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.test_name.trim()) {
      setError("Test name is required.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const newOrder = await createStudentLabOrder(assignmentId, formData);
      setOrders((prev) => [newOrder, ...prev]);
      setFormData({
        test_name: "",
        test_code: "",
        category: "Chemistry",
        clinical_indication: "",
        fasting_required: false,
        specimen_type: "Venous Blood",
        priority: "Routine",
        special_instructions: "",
      });
    } catch (err) {
      setError(err.message || "Failed to create lab order.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (orderId) => {
    if (!window.confirm("Are you sure you want to delete this lab order?")) return;
    try {
      await deleteStudentLabOrder(orderId);
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (err) {
      alert(err.message || "Failed to delete lab order.");
    }
  };

  if (loading) return <p className="case-help-text">Loading lab orders...</p>;

  return (
    <div className="panel data-panel" style={{ padding: 16, marginBottom: 16 }}>
      <div className="case-section-heading" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Order New Laboratory Test</h2>
      </div>

      {error && <p role="alert" style={{ color: "#d9534f", fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Test Name *</label>
            <input 
              type="text" 
              name="test_name" 
              value={formData.test_name} 
              onChange={handleChange} 
              placeholder="e.g., Comprehensive Metabolic Panel" 
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Test Code / LOINC</label>
            <input 
              type="text" 
              name="test_code" 
              value={formData.test_code} 
              onChange={handleChange} 
              placeholder="e.g., 24323-8" 
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category</label>
            <select 
              name="category" 
              value={formData.category} 
              onChange={handleChange} 
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            >
              <option value="Chemistry">Chemistry</option>
              <option value="Hematology">Hematology</option>
              <option value="Microbiology">Microbiology</option>
              <option value="Pathology">Pathology</option>
              <option value="Radiology">Radiology</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Priority</label>
            <select 
              name="priority" 
              value={formData.priority} 
              onChange={handleChange} 
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            >
              <option value="Routine">Routine</option>
              <option value="STAT">STAT</option>
              <option value="ASAP">ASAP</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Specimen Type</label>
            <input 
              type="text" 
              name="specimen_type" 
              value={formData.specimen_type} 
              onChange={handleChange} 
              placeholder="e.g., Venous Blood" 
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              <input 
                type="checkbox" 
                name="fasting_required" 
                checked={formData.fasting_required} 
                onChange={handleChange} 
              />
              Fasting Required
            </label>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Clinical Indication</label>
          <input 
            type="text" 
            name="clinical_indication" 
            value={formData.clinical_indication} 
            onChange={handleChange} 
            placeholder="e.g., Rule out electrolyte imbalance" 
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Special Instructions</label>
          <textarea 
            name="special_instructions" 
            value={formData.special_instructions} 
            onChange={handleChange} 
            placeholder="Enter any special handling or patient instructions..." 
            rows="2" 
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="submit" className="primary-button" disabled={submitting} style={{ padding: "8px 16px" }}>
            {submitting ? "Placing Order..." : "Submit Lab Order"}
          </button>
        </div>
      </form>

      <div>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Active Lab Orders</h3>
        {orders.length === 0 ? (
          <p className="case-help-text">No lab orders recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Test Name</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Specimen</th>
                  <th>Fasting</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.test_name}</strong> {o.test_code && <span style={{ fontSize: 11, color: "#666" }}>({o.test_code})</span>}</td>
                    <td>{o.category}</td>
                    <td><span className={`priority-badge ${o.priority === "STAT" ? "stat" : ""}`}>{o.priority}</span></td>
                    <td>{o.specimen_type || "N/A"}</td>
                    <td>{o.fasting_required ? "Yes" : "No"}</td>
                    <td><span className="status-badge">{o.status}</span></td>
                    <td>
                      <button 
                        type="button" 
                        className="secondary-button" 
                        onClick={() => handleDelete(o.id)}
                        style={{ padding: "4px 8px", fontSize: 12, color: "#d9534f", borderColor: "#d9534f" }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}