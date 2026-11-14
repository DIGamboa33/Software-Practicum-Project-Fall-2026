export function evaluateVitals(values, age = 30) {
  const warnings = {};

  const sys = parseFloat(values.systolic);
  const dia = parseFloat(values.diastolic);
  const hr = parseFloat(values.heart_rate);
  const temp = parseFloat(values.temperature);
  const resp = parseFloat(values.respiratory_rate);
  const spo2 = parseFloat(values.spo2);
  const glucose = parseFloat(values.blood_glucose_mg_dl);

  // Blood Pressure Evaluation
  if (!isNaN(sys) && !isNaN(dia)) {
    if (sys > 140 || dia > 90) {
      warnings.bp = "High (Stage 2 Hypertension)";
    } else if (sys < 90 || dia < 60) {
      warnings.bp = "Low (Hypotension)";
    }
  }

  // Heart Rate Evaluation (Adjusted slightly if pediatric < 12 years)
  if (!isNaN(hr)) {
    const maxHr = age < 12 ? 120 : 100;
    const minHr = age < 12 ? 70 : 60;
    if (hr > maxHr) warnings.hr = "Tachycardia (Elevated)";
    if (hr < minHr) warnings.hr = "Bradycardia (Low)";
  }

  // Temperature (°F)
  if (!isNaN(temp)) {
    if (temp >= 100.4) warnings.temperature = "Fever (Elevated)";
    if (temp < 95.0) warnings.temperature = "Hypothermia Risk";
  }

  // Oxygen Saturation
  if (!isNaN(spo2)) {
    if (spo2 < 92) warnings.spo2 = "Critical Hypoxia (< 92%)";
    else if (spo2 < 95) warnings.spo2 = "Borderline SpO2";
  }

  // Respiratory Rate
  if (!isNaN(resp)) {
    if (resp > 20) warnings.respiratory_rate = "Tachypnea (Elevated)";
    if (resp < 12) warnings.respiratory_rate = "Bradypnea (Low)";
  }

  // Blood Glucose
  if (!isNaN(glucose)) {
    if (glucose > 200) warnings.blood_glucose_mg_dl = "Hyperglycemia";
    if (glucose < 70) warnings.blood_glucose_mg_dl = "Hypoglycemia";
  }

  return warnings;
}