import { useMemo } from "react";
import { evaluateVitals } from "../lib/vitalsvalidation";

export default function VitalsDetailModal({ vital, patientAge = 30, onClose }) {
  if (!vital) return null;

  const warnings = useMemo(() => evaluateVitals(vital, patientAge), [vital, patientAge]);
  const hasWarnings = Object.keys(warnings).length > 0;

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="panel data-panel" style={{ width: "100%", maxWidth: 500, padding: 24, background: "#fff", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Vital Record Details</h2>
          <button type="button" className="secondary-button" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>

        <p className="case-help-text" style={{ marginBottom: 16 }}>
          Recorded at: {new Date(vital.recorded_at ?? vital.created_at).toLocaleString()}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div><strong>Blood Pressure:</strong> {vital.systolic && vital.diastolic ? `${vital.systolic}/${vital.diastolic} mmHg` : "Not recorded"}</div>
          <div><strong>Heart Rate:</strong> {vital.heart_rate ? `${vital.heart_rate} bpm` : "Not recorded"}</div>
          <div><strong>Temperature:</strong> {vital.temperature ? `${vital.temperature} °F` : "Not recorded"}</div>
          <div><strong>SpO2:</strong> {vital.spo2 ? `${vital.spo2}%` : "Not recorded"}</div>
          <div><strong>Resp Rate:</strong> {vital.respiratory_rate ? `${vital.respiratory_rate}/min` : "Not recorded"}</div>
          <div><strong>Weight:</strong> {vital.weight_lbs ? `${vital.weight_lbs} lbs` : "Not recorded"}</div>
          <div><strong>Glucose:</strong> {vital.blood_glucose_mg_dl ? `${vital.blood_glucose_mg_dl} mg/dL` : "Not recorded"}</div>
        </div>

        <div style={{ borderTop: "1px solid #e5e9f0", paddingTop: 12, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>Clinical Evaluation & Warnings</h3>
          {hasWarnings ? (
            <ul style={{ margin: 0, paddingLeft: 20, color: "#d9534f", fontSize: 13 }}>
              {Object.entries(warnings).map(([key, msg]) => (
                <li key={key}><strong>{key.toUpperCase()}:</strong> {msg}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "#28a745", fontSize: 13, margin: 0 }}>✓ All measured vitals fall within normal limits.</p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="primary-button" onClick={onClose} style={{ padding: "8px 16px" }}>Close</button>
        </div>
      </div>
    </div>
  );
}