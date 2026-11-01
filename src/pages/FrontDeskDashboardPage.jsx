import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import {
  fetchFrontDeskDashboard,
  updateFrontDeskAppointmentStatus,
  createFrontDeskAppointment,
  confirmFrontDeskIntake
} from '../lib/api';

export default function FrontDeskDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');


  const [profiles, setProfiles] = useState([]);
  const [patientRecords, setPatientRecords] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [insuranceProviders, setInsuranceProviders] = useState([]);

  const [selectedIntake, setSelectedIntake] = useState(null);
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);
  const [walkInPatientId, setWalkInPatientId] = useState('');

  // Add these states at the top of your component alongside your other states:
  const [patientReferrals, setPatientReferrals] = useState([]);
  const [selectedReferralId, setSelectedReferralId] = useState('');

  const [newAppt, setNewAppt] = useState({ patient_id: '', reason: '', appointment_date: '' });

  // Load dashboard data on mount
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const data = await fetchFrontDeskDashboard();
      setProfiles(data.profiles || []);
      setPatientRecords(data.patientRecords || []);
      setAppointments(data.appointments || []);
      setInsuranceProviders(data.insuranceProviders || []);
      setError('');
    } catch (err) {
      setError(err.message || "Failed to load front desk dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const getPatientName = (patientId) => {
    const profile = profiles.find(p => p.id === patientId);
    if (!profile) return 'Patient';
    if (profile.first_name || profile.last_name) {
      return `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    }
    if (profile.name) return profile.name;
    if (profile.full_name) return profile.full_name;
    if (profile.utep_id) return `ID: ${profile.utep_id}`;
    if (profile.email) return profile.email;
    return 'Patient';
  };

  const getProviderName = (providerId) => {
    const prov = insuranceProviders.find(ip => ip.id === providerId);
    return prov ? prov.name : 'Not Provided';
  };

  // 1. Intake Queue
  const intakeQueue = appointments
    .filter(a => a.status !== 'Checked-In' && a.status !== 'Completed')
    .map(appt => {
      const record = patientRecords.find(r => r.profile_id === appt.patient_id) || {};
      return {
        profile_id: appt.patient_id,
        appointment_id: appt.id,
        patient_name: getPatientName(appt.patient_id),
        phone: record.phone || '',
        address: record.address || '',
        insurance_provider_id: record.insurance_provider_id || '',
        insurance_provider_name: getProviderName(record.insurance_provider_id),
        insurance_policy_number: record.insurance_policy_number || '',
        appointment_date: appt.appointment_date,
        reason: appt.reason || 'Scheduled Consultation',
        status: appt.status || 'Scheduled'
      };
    });

  // 2. In-Progress Queue
  const inProgressQueue = appointments
    .filter(a => a.status === 'Checked-In')
    .map(appt => {
      const record = patientRecords.find(r => r.profile_id === appt.patient_id) || {};
      return {
        profile_id: appt.patient_id,
        appointment_id: appt.id,
        patient_name: getPatientName(appt.patient_id),
        phone: record.phone || '',
        address: record.address || '',
        insurance_provider_id: record.insurance_provider_id || '',
        insurance_provider_name: getProviderName(record.insurance_provider_id),
        insurance_policy_number: record.insurance_policy_number || '',
        appointment_date: appt.appointment_date,
        reason: appt.reason || 'In-Progress Visit',
        status: 'In-Progress'
      };
    });

  const activeAppointmentPatientIds = new Set(appointments.filter(a => a.status !== 'Completed').map(a => a.patient_id));
  const walkInPatients = profiles.filter(profile => !activeAppointmentPatientIds.has(profile.id));

  const walkInOptions = walkInPatients.map(p => ({
    value: p.id,
    label: getPatientName(p.id)
  }));

  const allPatientOptions = profiles.map(p => ({
    value: p.id,
    label: getPatientName(p.id)
  }));

  const metrics = [
    { label: "Intake Queue", value: intakeQueue.length, note: "Awaiting verification & check-in", tone: "teal" },
    { label: "In-Progress (Checked-In)", value: inProgressQueue.length, note: "Appointments in progress", tone: "indigo" },
    { label: "Scheduled visits", value: appointments.filter(a => a.status === 'Scheduled').length, note: "Scheduled visits", tone: "amber" },
  ];

  const handleConfirmIntake = async (e) => {
    e.preventDefault();
    if (!selectedIntake) return;

    try {
      await confirmFrontDeskIntake({
        patient_id: selectedIntake.profile_id,
        phone: selectedIntake.phone,
        address: selectedIntake.address,
        insurance_provider_id: selectedIntake.insurance_provider_id,
        insurance_policy_number: selectedIntake.insurance_policy_number,
        appointment_id: selectedIntake.appointment_id || null
      });

      setFeedback('Patient intake verified and moved to In-Progress (Checked-In).');
      setSelectedIntake(null);
      setWalkInModalOpen(false);
      setWalkInPatientId('');
      await loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSelectWalkInPatient = (selectedOption) => {
    const pId = selectedOption ? selectedOption.value : '';
    setWalkInPatientId(pId);
    const record = patientRecords.find(r => r.profile_id === pId) || {};
    if (pId) {
      setSelectedIntake({
        profile_id: pId,
        appointment_id: null,
        patient_name: getPatientName(pId),
        phone: record.phone || '',
        address: record.address || '',
        insurance_provider_id: record.insurance_provider_id || '',
        insurance_policy_number: record.insurance_policy_number || ''
      });
    } else {
      setSelectedIntake(null);
    }
  };

  const handlePatientSelectForScheduling = async (option) => {
    const pId = option ? option.value : '';
    setNewAppt({ ...newAppt, patient_id: pId });
    setSelectedReferralId('');
    setPatientReferrals([]);

    if (pId) {
      try {
        const referrals = await fetchFrontDeskPatientReferrals(pId);
        // Filter for pending referrals
        setPatientReferrals(referrals.filter(r => r.status === 'Pending'));
      } catch (err) {
        console.error("Error fetching referrals:", err);
      }
    }
  };


  const handleScheduleAppointment = async (e) => {
    e.preventDefault();
    try {
      const createdAppt = await createFrontDeskAppointment({
        patient_id: newAppt.patient_id,
        reason: newAppt.reason,
        appointment_date: newAppt.appointment_date,
        location: "Main Clinic Room A"
      });

      // If a referral was selected, update its status and link the new appointment id
      if (selectedReferralId && createdAppt?.id) {
        await updateFrontDeskReferralAppointment(selectedReferralId, createdAppt.id);
      }

      setNewAppt({ patient_id: '', reason: '', appointment_date: '' });
      setPatientReferrals([]);
      setSelectedReferralId('');
      setFeedback('Appointment scheduled and referral updated successfully.');
      await loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleCheckIn = async (appointmentId, currentStatus) => {
    const newStatus = currentStatus === 'Checked-In' ? 'Scheduled' : 'Checked-In';
    try {
      await updateFrontDeskAppointmentStatus(appointmentId, newStatus);
      setFeedback(newStatus === 'Scheduled' ? 'Check-in undone; moved back to intake queue.' : 'Patient checked-in successfully.');
      await loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCompleteVisit = async (appointmentId) => {
    try {
      await updateFrontDeskAppointmentStatus(appointmentId, 'Completed');
      setFeedback('Visit completed and checked-out successfully.');
      await loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="dashboard-page content-page instructor-workspace"><p className="directory-loading">Loading Front Desk Workspace...</p></div>;
  }

  return (
    <div className="dashboard-page content-page instructor-workspace">

      <section className="page-heading">
        <div>
          <p className="section-label">Front desk · administration</p>
          <h1>Front Desk Workspace</h1>
          <p>Manage patient intakes, track in-progress waiting rooms, and check-out completed visits.</p>
        </div>
      </section>

      {error && <section className="panel directory-error" style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fecaca', marginBottom: '16px' }}>{error}</section>}
      {feedback && <section className="panel directory-error" style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0', marginBottom: '16px' }}>{feedback}</section>}

      <section className="instructor-overview-metrics">
        {metrics.map((metric) => (
          <article className={`panel instructor-overview-metric instructor-overview-metric--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      <section className="panel classroom-health-panel" style={{ padding: '12px 20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              Overview Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('intake')}
              className={`btn ${activeTab === 'intake' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              Intake Queue ({intakeQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inprogress')}
              className={`btn ${activeTab === 'inprogress' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              In-Progress Queue ({inProgressQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scheduling')}
              className={`btn ${activeTab === 'scheduling' ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              Schedule Appointment
            </button>
          </div>

          <button
            type="button"
            onClick={() => { setWalkInModalOpen(true); setSelectedIntake(null); setWalkInPatientId(''); }}
            className="btn btn-success"
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            + Take Walk-In
          </button>
        </div>
      </section>

      {/* Walk-In Modal Form */}
      {walkInModalOpen && (
        <section className="panel classroom-health-panel" style={{ marginBottom: '24px', border: '2px solid #10b981', background: '#f9fafb' }}>
          <div className="panel__header">
            <div><p className="section-label">Walk-In Management</p><h2>Process Patient Walk-In Intake & Check-In</h2></div>
            <button type="button" onClick={() => setWalkInModalOpen(false)} className="btn btn-sm btn-outline-secondary">Close X</button>
          </div>

          <div className="form-group" style={{ marginBottom: '16px', marginTop: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Search and Select Existing Patient</label>
            <Select
              options={walkInOptions}
              value={walkInOptions.find(opt => opt.value === walkInPatientId) || null}
              onChange={handleSelectWalkInPatient}
              placeholder="Type patient name to search..."
              isClearable
              isSearchable
            />
          </div>

          {selectedIntake && (
            <form onSubmit={handleConfirmIntake} className="scenario-form" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <h3>Verify Details for: {selectedIntake.patient_name}</h3>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Phone Number</label>
                <input type="text" value={selectedIntake.phone} onChange={e => setSelectedIntake({ ...selectedIntake, phone: e.target.value })} className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Address</label>
                <input type="text" value={selectedIntake.address} onChange={e => setSelectedIntake({ ...selectedIntake, address: e.target.value })} className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Insurance Provider</label>
                <select
                  value={selectedIntake.insurance_provider_id}
                  onChange={e => setSelectedIntake({ ...selectedIntake, insurance_provider_id: e.target.value })}
                  className="form-control"
                >
                  <option value="">-- Select Insurance Provider --</option>
                  {insuranceProviders.map(ip => (
                    <option key={ip.id} value={ip.id}>{ip.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Insurance Policy Number</label>
                <input type="text" value={selectedIntake.insurance_policy_number} onChange={e => setSelectedIntake({ ...selectedIntake, insurance_policy_number: e.target.value })} className="form-control" />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-success">Confirm Info & Check-In</button>
                <button type="button" onClick={() => setWalkInModalOpen(false)} className="btn btn-outline-secondary">Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Tab 1: Overview Summary */}
      {activeTab === 'overview' && (
        <section className="instructor-overview-grid">
          <article className="panel classroom-health-panel">
            <div className="panel__header">
              <div><p className="section-label">Workflow</p><h2>Upcoming Scheduled Appointments</h2></div>
              <span className="directory-live-indicator">● Live Database</span>
            </div>
            {intakeQueue.length ? (
              <div className="classroom-health-list">
                {intakeQueue.slice(0, 5).map(item => (
                  <article key={item.appointment_id} style={{ marginBottom: '12px' }}>
                    <div className="classroom-health-list__heading">
                      <div><h3>{item.patient_name}</h3><p>{item.reason} · {new Date(item.appointment_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p></div>
                      <span className="badge badge-warning" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', background: '#fef3c7', color: '#92400e' }}>{item.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="directory-loading">No upcoming scheduled appointments found.</p>}
          </article>
        </section>
      )}

      {/* Tab 2: Intake Queue */}
      {activeTab === 'intake' && (
        <section className="panel classroom-health-panel">
          <div className="panel__header">
            <div><p className="section-label">Verification</p><h2>Intake Queue (Awaiting Verification & Check-In)</h2></div>
          </div>
          {intakeQueue.length > 0 ? (
            <div className="table-responsive">
              <table className="table scenario-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Patient / Reason</th>
                    <th style={{ padding: '10px' }}>Scheduled Time</th>
                    <th style={{ padding: '10px' }}>Insurance</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {intakeQueue.map(item => (
                    <tr key={item.appointment_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px' }}>
                        <strong>{item.patient_name}</strong>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>{item.reason}</p>
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px' }}>{new Date(item.appointment_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '10px', fontSize: '13px' }}>{item.insurance_provider_name}</td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <button type="button" onClick={() => setSelectedIntake(item)} className="btn btn-sm btn-primary" style={{ padding: '4px 10px', fontSize: '12px' }}>
                          Verify & Check-In
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="directory-loading">No intakes pending.</p>}

          {selectedIntake && !walkInModalOpen && (
            <form onSubmit={handleConfirmIntake} className="scenario-form" style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <h3>Verify & Check-In: {selectedIntake.patient_name}</h3>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Confirm / Update Phone</label>
                <input type="text" value={selectedIntake.phone} onChange={e => setSelectedIntake({ ...selectedIntake, phone: e.target.value })} className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Confirm / Update Address</label>
                <input type="text" value={selectedIntake.address} onChange={e => setSelectedIntake({ ...selectedIntake, address: e.target.value })} className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Insurance Provider</label>
                <select
                  value={selectedIntake.insurance_provider_id}
                  onChange={e => setSelectedIntake({ ...selectedIntake, insurance_provider_id: e.target.value })}
                  className="form-control"
                >
                  <option value="">-- Select Insurance Provider --</option>
                  {insuranceProviders.map(ip => (
                    <option key={ip.id} value={ip.id}>{ip.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Confirm / Update Policy Number</label>
                <input type="text" value={selectedIntake.insurance_policy_number} onChange={e => setSelectedIntake({ ...selectedIntake, insurance_policy_number: e.target.value })} className="form-control" />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="btn btn-success">Save Details & Check-In</button>
                <button type="button" onClick={() => setSelectedIntake(null)} className="btn btn-outline-secondary">Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Tab 3: In-Progress / Checked-In Queue */}
      {activeTab === 'inprogress' && (
        <section className="panel classroom-health-panel">
          <div className="panel__header">
            <div><p className="section-label">Queue</p><h2>In-Progress (Checked-In / Waiting Room)</h2></div>
          </div>
          {inProgressQueue.length > 0 ? (
            <div className="table-responsive">
              <table className="table scenario-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                    <th style={{ padding: '10px' }}>Patient / Reason</th>
                    <th style={{ padding: '10px' }}>Scheduled Time</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inProgressQueue.map(item => (
                    <tr key={item.appointment_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px' }}>
                        <strong>{item.patient_name}</strong>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>{item.reason}</p>
                      </td>
                      <td style={{ padding: '10px', fontSize: '13px' }}>{new Date(item.appointment_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td style={{ padding: '10px' }}>
                        <span className="badge badge-success" style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', background: '#e0e7ff', color: '#3730a3' }}>
                          In-Progress
                        </span>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => handleCompleteVisit(item.appointment_id)} className="btn btn-sm btn-success" style={{ padding: '4px 10px', fontSize: '12px' }}>
                          Check-Out / Complete
                        </button>
                        <button type="button" onClick={() => handleToggleCheckIn(item.appointment_id, 'Checked-In')} className="btn btn-sm btn-outline-secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>
                          Undo Check-In
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="directory-loading">No patients currently in-progress.</p>}
        </section>
      )}

      {/* Tab 4: Appointment Scheduling */}
      {activeTab === 'scheduling' && (
        <section className="panel classroom-health-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="panel__header">
            <div><p className="section-label">Booking</p><h2>Schedule Standalone Appointment</h2></div>
          </div>
          <form onSubmit={handleScheduleAppointment} className="scenario-form" style={{ marginTop: '16px' }}>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Search and Select Patient</label>
              <Select
                options={allPatientOptions}
                value={allPatientOptions.find(opt => opt.value === newAppt.patient_id) || null}
                onChange={(option) => setNewAppt({ ...newAppt, patient_id: option ? option.value : '' })}
                placeholder="Type patient name to search..."
                isClearable
                isSearchable
              />
            </div>

            {/* Pop-up section if pending referrals exist for the selected patient */}
            {patientReferrals.length > 0 && (
              <div className="form-group" style={{ marginBottom: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                <label style={{ display: 'block', fontWeight: '600', color: '#166534', marginBottom: '6px' }}>
                  Pending Referrals Found ({patientReferrals.length})
                </label>
                <p style={{ fontSize: '12px', color: '#15803d', marginBottom: '8px' }}>Select a referral to tie this appointment to, or leave unselected for a standalone visit:</p>

                <select
                  value={selectedReferralId}
                  onChange={(e) => {
                    const refId = e.target.value;
                    setSelectedReferralId(refId);
                    // Auto-populate the reason if a referral is picked
                    const ref = patientReferrals.find(r => r.id === refId);
                    if (ref && ref.reason) {
                      setNewAppt(prev => ({ ...prev, reason: ref.reason }));
                    }
                  }}
                  className="form-control"
                >
                  <option value="">-- None (Standalone Appointment) --</option>
                  {patientReferrals.map(ref => (
                    <option key={ref.id} value={ref.id}>
                      {ref.reason || 'General Referral'} (Specialty: {ref.specialty || 'General'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Reason for Visit / Follow-up Note</label>
              <input type="text" value={newAppt.reason} onChange={e => setNewAppt({ ...newAppt, reason: e.target.value })} placeholder="e.g., Return in 3 weeks per provider notes" className="form-control" required />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Appointment Date & Time</label>
              <input type="datetime-local" value={newAppt.appointment_date} onChange={e => setNewAppt({ ...newAppt, appointment_date: e.target.value })} className="scenario-form select form-control" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '10px' }}>
              Schedule Appointment
            </button>
          </form>
        </section>
      )}

    </div>
  );
}