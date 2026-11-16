import { useEffect, useState } from "react";
import { fetchStudentOrders, saveStudentOrders } from "../lib/api";

export default function StudentLabOrderForm({ assignmentId, onSaved }) {
  const [orderType, setOrderType] = useState("Lab");
  const [orderName, setOrderName] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadOrders() {
      if (!assignmentId) return;
      try {
        setLoading(true);
        const data = await fetchStudentOrders(assignmentId);
        if (active && Array.isArray(data)) {
          setOrders(
            data.map((order) => ({
              id: order.id,
              type: order.order_type,
              name: order.order_name,
              status: order.status,
            }))
          );
        }
      } catch (err) {
        if (active) setError("Failed to load existing orders.");
      } finally {
        if (active) setLoading(false);
      }
    }
    loadOrders();
    return () => { active = false; };
  }, [assignmentId]);

  const handleAddOrder = () => {
    if (!orderName.trim()) return;

    const newOrder = {
      id: `new-${Date.now()}`,
      type: orderType,
      name: orderName.trim(),
      status: "Draft",
    };

    setOrders((prev) => [...prev, newOrder]);
    setOrderName("");
  };

  const handleRemoveOrder = (orderId) => {
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      await saveStudentOrders(assignmentId, orders);
      alert("Orders saved successfully!");
      onSaved?.();
    } catch (err) {
      setError(err.message || "Failed to save orders.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="case-help-text">Loading orders...</p>;

  return (
    <div className="panel data-panel" style={{ padding: 16, marginBottom: 16 }}>
      <div className="case-section-heading" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Create Lab / Diagnostic Order</h2>
      </div>

      {error && <p role="alert" style={{ color: "#d9534f", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Order Type</label>
          <select 
            value={orderType} 
            onChange={(e) => setOrderType(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="Lab">Lab</option>
            <option value="Imaging">Imaging</option>
            <option value="Medication">Medication</option>
            <option value="Referral">Referral</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description / Test Name</label>
          <input 
            type="text" 
            value={orderName} 
            onChange={(e) => setOrderName(e.target.value)} 
            placeholder="e.g., Comprehensive Metabolic Panel (CMP)" 
            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button type="button" className="secondary-button" onClick={handleAddOrder} style={{ padding: "8px 16px" }}>
          Add to Drafts
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Draft Orders</h3>
        {orders.length === 0 ? (
          <p className="case-help-text">No orders added yet.</p>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.type}</td>
                    <td>{order.name}</td>
                    <td><span className="status-badge">{order.status}</span></td>
                    <td>
                      <button 
                        type="button" 
                        className="secondary-button" 
                        onClick={() => handleRemoveOrder(order.id)}
                        style={{ padding: "4px 8px", fontSize: 12 }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button 
          type="button" 
          className="primary-button" 
          disabled={saving}
          onClick={handleSave} 
          style={{ padding: "8px 16px" }}
        >
          {saving ? "Saving..." : "Save Orders"}
        </button>
      </div>
    </div>
  );
}
