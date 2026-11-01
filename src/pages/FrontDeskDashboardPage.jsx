import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import {
  fetchFrontDeskDashboard,
  updateFrontDeskAppointmentStatus,
  createFrontDeskAppointment,
  confirmFrontDeskIntake, 
  fetchFrontDeskPatientReferrals,
  updateFrontDeskReferralAppointment,
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
    { label: "In-Progress (Checked-In)", value: inProgressQueue.length, note: "Appointments in progress", tone: "blue" },
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
        <button
          type="button"
          onClick={() => { setWalkInModalOpen(true); setSelectedIntake(null); setWalkInPatientId(''); }}
          className="primary-button directory-create-button"
        >
          + Take Walk-In
        </button>
      </section>

      {error && <section className="panel directory-error">{error}</section>}
      {feedback && <section className="panel directory-error directory-success">{feedback}</section>}

      <section className="metric-grid instructor-overview-metrics">
        {metrics.map((metric) => (
          <article className={`panel instructor-overview-metric instructor-overview-metric--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      {/* Tabs navigation using roster-controls__tabs / roster-view-button */}
      <section className="panel classroom-health-panel" style={{ padding: '14px 20px', marginBottom: '18px' }}>
        <div className="roster-controls" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          <div className="roster-controls__tabs">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`roster-view-button ${activeTab === 'overview' ? 'roster-view-button--active' : ''}`}
            >
              Overview Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('intake')}
              className={`roster-view-button ${activeTab === 'intake' ? 'roster-view-button--active' : ''}`}
            >
              Intake Queue ({intakeQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inprogress')}
              className={`roster-view-button ${activeTab === 'inprogress' ? 'roster-view-button--active' : ''}`}
            >
              In-Progress Queue ({inProgressQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scheduling')}
              className={`roster-view-button ${activeTab === 'scheduling' ? 'roster-view-button--active' : ''}`}
            >
              Schedule Appointment
            </button>
          </div>
        </div>
      </section>

      {/* Walk-In Modal Overlay */}
      {walkInModalOpen && (
        <div className="account-modal-backdrop">
          <div className="panel account-detail-modal">
            <div className="panel__header">
              <div>
                <p className="section-label">Walk-In Management</p>
                <h2>Process Patient Walk-In Intake & Check-In</h2>
              </div>
              <button type="button" onClick={() => setWalkInModalOpen(false)} className="text-button text-button--danger">Close X</button>
            </div>

            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '11px', fontWeight: '700', color: '#57627a' }}>Search and Select Existing Patient</label>
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
              <form onSubmit={handleConfirmIntake} className="scenario-form" style={{ marginTop: '16px' }}>
                <h3>Verify Details for: {selectedIntake.patient_name}</h3>
                <label>
                  Phone Number
                  <input type="text" value={selectedIntake.phone} onChange={e => setSelectedIntake({ ...selectedIntake, phone: e.target.value })} />
                </label>
                <label>
                  Address
                  <input type="text" value={selectedIntake.address} onChange={e => setSelectedIntake({ ...selectedIntake, address: e.target.value })} />
                </label>
                <label>
                  Insurance Provider
                  <select
                    value={selectedIntake.insurance_provider_id}
                    onChange={e => setSelectedIntake({ ...selectedIntake, insurance_provider_id: e.target.value })}
                  >
                    <option value="">-- Select Insurance Provider --</option>
                    {insuranceProviders.map(ip => (
                      <option key={ip.id} value={ip.id}>{ip.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Insurance Policy Number
                  <input type="text" value={selectedIntake.insurance_policy_number} onChange={e => setSelectedIntake({ ...selectedIntake, insurance_policy_number: e.target.value })} />
                </label>
                <div className="form-actions" style={{ marginTop: '12px' }}>
                  <button type="submit" className="primary-button">Confirm Info & Check-In</button>
                  <button type="button" onClick={() => setWalkInModalOpen(false)} className="secondary-button">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Tab 1: Overview Summary */}
      {activeTab === 'overview' && (
        <section className="panel classroom-health-paneld">

          <div className="panel__header">
            <div><p className="section-label">Workflow</p><h2>Upcoming Scheduled Appointments</h2></div>
            <span className="directory-live-indicator">● Live Database</span>
          </div>
          {intakeQueue.length ? (
            <div className="classroom-health-list">
              {intakeQueue.slice(0, 5).map(item => (
                <article key={item.appointment_id}>
                  <div className="classroom-health-list__heading">
                    <div>
                      <h3>{item.patient_name}</h3>
                      <p>{item.reason} · {new Date(item.appointment_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                    </div>
                    <span className="status-badge status-badge--pending">{item.status}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="directory-loading">No upcoming scheduled appointments found.</p>}

        </section>
      )}

      {/* Tab 2: Intake Queue */}
      {activeTab === 'intake' && (
        <section className="panel classroom-health-panel">
          <div className="panel__header">
            <div><p className="section-label">Verification</p><h2>Intake Queue (Awaiting Verification & Check-In)</h2></div>
          </div>
          {intakeQueue.length > 0 ? (
            <div className="table-wrap" style={{ marginTop: '16px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Patient / Reason</th>
                    <th>Scheduled Time</th>
                    <th>Insurance</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {intakeQueue.map(item => (
                    <tr key={item.appointment_id}>
                      <td>
                        <div>
                          <strong>{item.patient_name}</strong>
                          <small>{item.reason}</small>
                        </div>
                      </td>
                      <td>{new Date(item.appointment_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>{item.insurance_provider_name}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" onClick={() => setSelectedIntake(item)} className="primary-button" style={{ padding: '6px 12px', fontSize: '11px' }}>
                          Verify & Check-In
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="directory-loading">No intakes pending.</p>}

          {/* Verification Modal Overlay */}
          {selectedIntake && !walkInModalOpen && (
            <div className="account-modal-backdrop">
              <div className="panel account-detail-modal">
                <div className="panel__header">
                  <div>
                    <p className="section-label">Intake Verification</p>
                    <h2>Verify & Check-In: {selectedIntake.patient_name}</h2>
                  </div>
                  <button type="button" onClick={() => setSelectedIntake(null)} className="text-button text-button--danger">Close X</button>
                </div>
                <form onSubmit={handleConfirmIntake} className="scenario-form" style={{ marginTop: '16px' }}>
                  <label>
                    Confirm / Update Phone
                    <input type="text" value={selectedIntake.phone} onChange={e => setSelectedIntake({ ...selectedIntake, phone: e.target.value })} />
                  </label>
                  <label>
                    Confirm / Update Address
                    <input type="text" value={selectedIntake.address} onChange={e => setSelectedIntake({ ...selectedIntake, address: e.target.value })} />
                  </label>
                  <label>
                    Insurance Provider
                    <select
                      value={selectedIntake.insurance_provider_id}
                      onChange={e => setSelectedIntake({ ...selectedIntake, insurance_provider_id: e.target.value })}
                    >
                      <option value="">-- Select Insurance Provider --</option>
                      {insuranceProviders.map(ip => (
                        <option key={ip.id} value={ip.id}>{ip.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Confirm / Update Policy Number
                    <input type="text" value={selectedIntake.insurance_policy_number} onChange={e => setSelectedIntake({ ...selectedIntake, insurance_policy_number: e.target.value })} />
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="primary-button">Save Details & Check-In</button>
                    <button type="button" onClick={() => setSelectedIntake(null)} className="secondary-button">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
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
            <div className="table-wrap" style={{ marginTop: '16px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Patient / Reason</th>
                    <th>Scheduled Time</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inProgressQueue.map(item => (
                    <tr key={item.appointment_id}>
                      <td>
                        <div>
                          <strong>{item.patient_name}</strong>
                          <small>{item.reason}</small>
                        </div>
                      </td>
                      <td>{new Date(item.appointment_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td>
                        <span className="status-badge status-badge--active">In-Progress</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => handleCompleteVisit(item.appointment_id)} className="primary-button" style={{ padding: '6px 10px', fontSize: '11px' }}>
                            Check-Out / Complete
                          </button>
                          <button type="button" onClick={() => handleToggleCheckIn(item.appointment_id, 'Checked-In')} className="secondary-button" style={{ padding: '6px 10px', fontSize: '11px' }}>
                            Undo Check-In
                          </button>
                        </div>
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
            <label>
              Search and Select Patient
              <Select
                options={allPatientOptions}
                value={allPatientOptions.find(opt => opt.value === newAppt.patient_id) || null}
                onChange={handlePatientSelectForScheduling}
                placeholder="Type patient name to search..."
                isClearable
                isSearchable
              />
            </label>

            {patientReferrals.length > 0 && (
              <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                <label style={{ color: '#166534', fontWeight: '700' }}>
                  Pending Referrals Found ({patientReferrals.length})
                </label>
                <p style={{ fontSize: '11px', color: '#15803d', margin: '4px 0 8px' }}>Select a referral to tie this appointment to, or leave unselected for a standalone visit:</p>
                <select
                  value={selectedReferralId}
                  onChange={(e) => {
                    const refId = e.target.value;
                    setSelectedReferralId(refId);
                    const ref = patientReferrals.find(r => r.id === refId);
                    if (ref && ref.reason) {
                      setNewAppt(prev => ({ ...prev, reason: ref.reason }));
                    }
                  }}
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

            <label>
              Reason for Visit / Follow-up Note
              <input type="text" value={newAppt.reason} onChange={e => setNewAppt({ ...newAppt, reason: e.target.value })} placeholder="e.g., Return in 3 weeks per provider notes" required />
            </label>

            <label>
              Appointment Date & Time
              <input type="datetime-local" value={newAppt.appointment_date} onChange={e => setNewAppt({ ...newAppt, appointment_date: e.target.value })} required />
            </label>

            <div className="form-actions">
              <button type="submit" className="primary-button" style={{ width: '100%', justifyContent: 'center' }}>
                Schedule Appointment
              </button>
            </div>
          </form>
        </section>
      )}

    </div>
  );
}
