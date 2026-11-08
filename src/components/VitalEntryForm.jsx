import { useState } from "react";

export default function VitalEntryForm({ onSubmitVital, onCancel }) {
  const [formData, setFormData] = useState({
    systolic: "",
    diastolic: "",
    heart_rate: "",
    temperature: "",
    respiratory_rate: "",
    spo2: "",
    weight_lbs: "",
    blood_glucose_mg_dl: "",
    recorded_at: new Date().toISOString().slice(0, 16),
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmitVital?.(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="panel data-panel" style={{ padding: 16, marginBottom: 16 }}>
      <div className="case-section-heading" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Record New Vitals</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Systolic (mmHg)</label>
          <input type="number" name="systolic" value={formData.systolic} onChange={handleChange} placeholder="120" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Diastolic (mmHg)</label>
          <input type="number" name="diastolic" value={formData.diastolic} onChange={handleChange} placeholder="80" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Heart Rate (bpm)</label>
          <input type="number" name="heart_rate" value={formData.heart_rate} onChange={handleChange} placeholder="72" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Temp (°F)</label>
          <input type="number" step="0.1" name="temperature" value={formData.temperature} onChange={handleChange} placeholder="98.6" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Resp Rate (/min)</label>
          <input type="number" name="respiratory_rate" value={formData.respiratory_rate} onChange={handleChange} placeholder="16" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>SpO2 (%)</label>
          <input type="number" name="spo2" value={formData.spo2} onChange={handleChange} placeholder="98" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Weight (lbs)</label>
          <input type="number" step="0.1" name="weight_lbs" value={formData.weight_lbs} onChange={handleChange} placeholder="160" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Glucose (mg/dL)</label>
          <input type="number" name="blood_glucose_mg_dl" value={formData.blood_glucose_mg_dl} onChange={handleChange} placeholder="100" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {onCancel && (
          <button type="button" className="secondary-button" onClick={onCancel} style={{ padding: "8px 16px" }}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary-button" style={{ padding: "8px 16px" }}>
          Save Vitals
        </button>
      </div>
    </form>
  );
}



  
 