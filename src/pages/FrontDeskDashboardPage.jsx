import React, { useState } from 'react';

export default function FrontDeskDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview');

  // Placeholder data for testing UI design
  const [incomingIntakes, setIncomingIntakes] = useState([
    {
      id: 'intake-01',
      patient_id: '9b28c9c1-6273-4dc2-993a-42048aca9f01',
      patient_name: 'Morgan Lee (Regular Patient)',
      phone: '(555) 019-2834',
      address: '123 Healthway Lane, Austin, TX 78701',
      insurance_provider: 'BlueCross BlueShield',
      insurance_policy_number: 'BCBS-987654321',
      reason_for_visit: '3-Week Post-Visit Follow-up'
    }
  ]);

  const [appointments, setAppointments] = useState([
    {
      id: 'app-101',
      patient_name: 'Morgan Lee',
      reason: 'Follow-up Consultation',
      appointment_date: '2026-10-29T09:30:00Z',
      status: 'Scheduled'
    },
    {
      id: 'app-102',
      patient_name: 'Jordan Smith',
      reason: 'General Consultation',
      appointment_date: '2026-10-29T11:00:00Z',
      status: 'Checked-In'
    }
  ]);

  const [selectedIntake, setSelectedIntake] = useState(null);
  const [newAppt, setNewAppt] = useState({ patient_name: '', reason: '', appointment_date: '' });
  const [feedback, setFeedback] = useState('');

  const metrics = [
    { label: "Pending intakes", value: incomingIntakes.length, note: "Awaiting front desk verification", tone: "amber" },
    { label: "Scheduled visits", value: appointments.filter(a => a.status === 'Scheduled').length, note: "Awaiting check-in", tone: "teal" },
    { label: "Checked-in", value: appointments.filter(a => a.status === 'Checked-In').length, note: "Currently in waiting room", tone: "indigo" },
  ];

  const handleConfirmIntake = (e) => {
    e.preventDefault();
    if (!selectedIntake) return;

    setAppointments(appointments.map(app => 
      app.patient_name === selectedIntake.patient_name ? { ...app, status: 'Checked-In' } : app
    ));
    setIncomingIntakes(incomingIntakes.filter(i => i.id !== selectedIntake.id));
    setSelectedIntake(null);
    setFeedback('Intake packet confirmed, records matched, and patient checked-in successfully.');
    setTimeout(() => setFeedback(''), 4000);
  };

  const handleScheduleAppointment = (e) => {
    e.preventDefault();
    const created = {
      id: `app-${Date.now()}`,
      patient_name: newAppt.patient_name,
      reason: newAppt.reason || 'General Appointment',
      appointment_date: newAppt.appointment_date || '2026-10-30T10:00:00Z',
      status: 'Scheduled'
    };
    setAppointments([...appointments, created]);
    setNewAppt({ patient_name: '', reason: '', appointment_date: '' });
    setFeedback('Appointment scheduled successfully.');
    setTimeout(() => setFeedback(''), 4000);
  };

  const handleToggleCheckIn = (appId) => {
    setAppointments(appointments.map(app => {
      if (app.id === appId) {
        const newStatus = app.status === 'Checked-In' ? 'Scheduled' : 'Checked-In';
        return { ...app, status: newStatus };
      }
      return app;
    }));
  };

  return (
    <div className="dashboard-page content-page instructor-workspace">
      
      {/* Page Heading */}
      <section className="page-heading">
        <div>
          <p className="section-label">Front desk · administration</p>
          <h1>Front Desk Workspace</h1>
          <p>Verify incoming intake packets, manage patient check-in queues, and schedule clinical visits.</p>
        </div>
      </section>

      {feedback && <section className="panel directory-error" style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}>{feedback}</section>}

      {/* Top Overview Metrics */}
      <section className="instructor-overview-metrics">
        {metrics.map((metric) => (
          <article className={`panel instructor-overview-metric instructor-overview-metric--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      {/* Tab Navigation (Matching PatientsHealthInsightsPage filter tab conventions) */}
      <section className="panel classroom-health-panel" style={{ padding: '12px 20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            onClick={() => setActiveTab('overview')} 
            className={`case-tab ${activeTab === 'overview' ? 'case-tab--active' : ''}`}
            
          >
            Overview Summary
          </button>
          <button 
            type="button" 
            onClick={() => setActiveTab('intake')} 
            className={`case-tab ${activeTab === 'intake' ? 'case-tab--active' : ''}`}
            
          >
            Intake Queue ({incomingIntakes.length})
          </button>
          <button 
            type="button" 
            onClick={() => setActiveTab('checkin')} 
            className={`case-tab ${activeTab === 'checkin' ? 'case-tab--active' : ''}`}
           
          >
            Check-In Queue
          </button>
          <button 
            type="button" 
            onClick={() => setActiveTab('scheduling')} 
            className={`case-tab ${activeTab === 'scheduling' ? 'case-tab--active' : ''}`}
            
          >
            Schedule Appointment
          </button>
        </div>
      </section>

      {/* Tab 1: Overview Summary */}
      {activeTab === 'overview' && (
        <section className="instructor-overview-grid">
          <article className="panel classroom-health-panel">
            <div className="panel__header">
              <div><p className="section-label">Intake workflow</p><h2>Pending Intakes</h2></div>
              <span className="directory-live-indicator">● Active Queue</span>
            </div>
            {incomingIntakes.length ? (
              <div className="classroom-health-list">
                {incomingIntakes.map(item => (
                  <article key={item.id} style={{ marginBottom: '12px' }}>
                    <div className="classroom-health-list__heading">
                      <div><h3>{item.patient_name}</h3><p>{item.reason_for_visit}</p></div>
                    </div>
                    <div className="classroom-stat-line"><span>Insurance: {item.insurance_provider}</span></div>
                  </article>
                ))}
              </div>
            ) : <p className="directory-loading">No pending intake packets found.</p>}
          </article>

          <article className="panel review-queue-panel">
            <div className="panel__header">
              <div><p className="section-label">Visits</p><h2>Today's Schedule</h2></div>
            </div>
            {appointments.length ? (
              <div className="classroom-health-list">
                {appointments.map(app => (
                  <article key={app.id} style={{ marginBottom: '12px' }}>
                    <div className="classroom-health-list__heading">
                      <div><h3>{app.patient_name}</h3><p>{app.reason}</p></div>
                      <span>{app.status}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="directory-loading">No appointments scheduled for today.</p>}
          </article>
        </section>
      )}

      {/* Tab 2: Intake Verification Queue */}
      {activeTab === 'intake' && (
        <section className="panel classroom-health-panel">
          <div className="panel__header">
            <div><p className="section-label">Verification</p><h2>Patient Intake Verification Queue</h2></div>
          </div>
          {incomingIntakes.length > 0 ? (
            <div className="classroom-health-list">
              {incomingIntakes.map(intake => (
                <article key={intake.id} style={{ marginBottom: '16px' }}>
                  <div className="classroom-health-list__heading">
                    <div>
                      <h3>{intake.patient_name}</h3>
                      <p>Phone: {intake.phone} · Address: {intake.address}</p>
                      <p>Insurance: {intake.insurance_provider} ({intake.insurance_policy_number})</p>
                    </div>
                    <button type="button" onClick={() => setSelectedIntake(intake)} className="primary-button" style={{ padding: '6px 12px', fontSize: '13px' }}>
                      Verify & Check-In
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="directory-loading">All patient intake forms have been verified.</p>}

          {selectedIntake && (
            <form onSubmit={handleConfirmIntake} className="scenario-form" style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <h3>Confirming Intake for: {selectedIntake.patient_name}</h3>
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Confirm / Update Phone</label>
                <input type="text" value={selectedIntake.phone} onChange={e => setSelectedIntake({...selectedIntake, phone: e.target.value})} className="form-control" />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label>Confirm / Update Insurance Provider</label>
                <input type="text" value={selectedIntake.insurance_provider} onChange={e => setSelectedIntake({...selectedIntake, insurance_provider: e.target.value})} className="form-control" />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="primary-button">Confirm Info & Check-In</button>
                <button type="button" onClick={() => setSelectedIntake(null)} className="secondary-button">Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Tab 3: Check-In Queue */}
      {activeTab === 'checkin' && (
        <section className="panel classroom-health-panel">
          <div className="panel__header">
            <div><p className="section-label">Queue</p><h2>Patient Check-In & Arrival Management</h2></div>
          </div>
          <div className="table-responsive">
            <table className="table scenario-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>Patient / Visit Reason</th>
                  <th style={{ padding: '10px' }}>Scheduled Time</th>
                  <th style={{ padding: '10px' }}>Status</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map(app => (
                  <tr key={app.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px' }}>
                      <strong>{app.patient_name}</strong>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>{app.reason}</p>
                    </td>
                    <td style={{ padding: '10px', fontSize: '13px' }}>{new Date(app.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '10px' }}>
                      <span className={`badge ${app.status === 'Checked-In' ? 'badge-success' : 'badge-warning'}`} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px' }}>
                        {app.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <button type="button" onClick={() => handleToggleCheckIn(app.id)} className="primary-button" style={{ padding: '4px 8px', fontSize: '12px' }}>
                        {app.status === 'Checked-In' ? 'Undo Check-In' : 'Check-In'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              <label>Patient Full Name</label>
              <input type="text" value={newAppt.patient_name} onChange={e => setNewAppt({...newAppt, patient_name: e.target.value})} placeholder="e.g., Morgan Lee" className="form-control" required />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label>Reason for Visit / Doctor Follow-up Note</label>
              <input type="text" value={newAppt.reason} onChange={e => setNewAppt({...newAppt, reason: e.target.value})} placeholder="e.g., Return in 3 weeks per provider notes" className="form-control" required />
            </div>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label>Appointment Date & Time</label>
              <input type="datetime-local" value={newAppt.appointment_date} onChange={e => setNewAppt({...newAppt, appointment_date: e.target.value})} className="scenario-form select form-control" required />
            </div>
            <button type="submit" className="primary-button" style={{ width: '100%', padding: '10px' }}>
              Schedule Appointment
            </button>
          </form>
        </section>
      )}

    </div>
  );
}