import { useState } from "react";

export default function LabOrderDetailModal({ order, onClose, onUpdate, onSubmitOrder, onDelete }) {
  if (!order) return null;

  const isDraft = order.status === "Draft";
  const [formData, setFormData] = useState({
    test_name: order.test_name || "",
    test_code: order.test_code || "",
    category: order.category || "Chemistry",
    priority: order.priority || "Routine",
    specimen_type: order.specimen_type || "",
    fasting_required: Boolean(order.fasting_required),
    clinical_indication: order.clinical_indication || "",
    special_instructions: order.special_instructions || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      await onUpdate(order.id, formData);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to update order.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusSubmit = async () => {
    try {
      setSaving(true);
      setError("");
      await onSubmitOrder(order.id, "Submitted");
      onClose();
    } catch (err) {
      setError(err.message || "Failed to submit order.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this lab order?")) return;
    try {
      setSaving(true);
      await onDelete(order.id);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to delete order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      background: "rgba(0, 0, 0, 0.5)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1000,
    }}>
      <div className="panel data-panel" style={{ width: "100%", maxWidth: 600, padding: 24, background: "#fff", borderRadius: 12, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Lab Order Details</h2>
            <span className="status-badge" style={{ marginTop: 4, display: "inline-block" }}>Status: {order.status}</span>
          </div>
          <button type="button" className="secondary-button" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        {error && <p role="alert" style={{ color: "#d9534f", fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {isDraft ? (
          <form onSubmit={handleSave}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Test Name *</label>
                <input type="text" name="test_name" value={formData.test_name} onChange={handleChange} required style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Test Code / LOINC</label>
                <input type="text" name="test_code" value={formData.test_code} onChange={handleChange} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category</label>
                <select name="category" value={formData.category} onChange={handleChange} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Hematology">Hematology</option>
                  <option value="Microbiology">Microbiology</option>
                  <option value="Pathology">Pathology</option>
                  <option value="Radiology">Radiology</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Priority</label>
                <select name="priority" value={formData.priority} onChange={handleChange} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}>
                  <option value="Routine">Routine</option>
                  <option value="STAT">STAT</option>
                  <option value="ASAP">ASAP</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Specimen Type</label>
                <input type="text" name="specimen_type" value={formData.specimen_type} onChange={handleChange} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                  <input type="checkbox" name="fasting_required" checked={formData.fasting_required} onChange={handleChange} />
                  Fasting Required
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Clinical Indication</label>
              <input type="text" name="clinical_indication" value={formData.clinical_indication} onChange={handleChange} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Special Instructions</label>
              <textarea name="special_instructions" value={formData.special_instructions} onChange={handleChange} rows="2" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e9f0", paddingTop: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="secondary-button" onClick={handleDelete} disabled={saving} style={{ color: "#d9534f", borderColor: "#d9534f" }}>Delete</button>
                <button type="button" className="secondary-button" onClick={handleStatusSubmit} disabled={saving}>Submit Order</button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
              </div>
            </div>
          </form>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div><strong>Test Name:</strong> {order.test_name}</div>
              <div><strong>Test Code:</strong> {order.test_code || "N/A"}</div>
              <div><strong>Category:</strong> {order.category}</div>
              <div><strong>Priority:</strong> {order.priority}</div>
              <div><strong>Specimen:</strong> {order.specimen_type || "N/A"}</div>
              <div><strong>Fasting Required:</strong> {order.fasting_required ? "Yes" : "No"}</div>
              <div style={{ gridColumn: "span 2" }}><strong>Clinical Indication:</strong> {order.clinical_indication || "None recorded"}</div>
              <div style={{ gridColumn: "span 2" }}><strong>Special Instructions:</strong> {order.special_instructions || "None recorded"}</div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e9f0", paddingTop: 16 }}>
              <button type="button" className="secondary-button" onClick={handleDelete} disabled={saving} style={{ color: "#d9534f", borderColor: "#d9534f" }}>Delete Order</button>
              <button type="button" className="primary-button" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}