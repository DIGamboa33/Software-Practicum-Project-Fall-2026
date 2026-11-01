import React, { useState, useEffect } from 'react';
import { fetchBillingDashboard, updateClaimStatus, updateClaimCodes } from  '../lib/api';

export default function BillingDashboardPage() {
  const [activeTab, setActiveTab] = useState('queue');
  const [claims, setClaims] = useState([]);
  const [insuranceProviders, setInsuranceProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Modal state for code selection & editing
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [isCodingModalOpen, setIsCodingModalOpen] = useState(false);
  const [activeCptCode, setActiveCptCode] = useState('99213');
  const [activeIcd10Code, setActiveIcd10Code] = useState('J02.9');

  // Load billing dashboard data on mount
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchBillingDashboard();
      setClaims(data.claims || []);
      setInsuranceProviders(data.insuranceProviders || []);
    } catch (err) {
      setError(err.message || 'Unable to load billing claims data.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (claimId, newStatus) => {
    try {
      setError('');
      const updated = await updateClaimStatus(claimId, newStatus);
      setClaims(claims.map(c => c.id === claimId ? updated : c));
      setFeedback(`Claim status successfully updated to: ${newStatus}`);
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update claim status.');
    }
  };

  const handleSaveCodes = async () => {
    if (!selectedClaim) return;
    try {
      setError('');
      const updated = await updateClaimCodes(selectedClaim.id, activeCptCode, activeIcd10Code);
      setClaims(claims.map(c => c.id === selectedClaim.id ? updated : c));
      setFeedback(`Updated coding selections for claim successfully.`);
      setIsCodingModalOpen(false);
      setSelectedClaim(null);
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to update claim codes.');
    }
  };

  // Helper to resolve insurance provider name from ID
  const getProviderName = (providerId) => {
    const provider = insuranceProviders.find(p => p.id === providerId);
    return provider ? provider.name : 'Unknown Insurer';
  };

  // Filter metrics
  const activeClaims = claims.filter(c => c.status === 'New' || c.status === 'Pending' || c.status === 'Denied');
  const settledClaims = claims.filter(c => c.status === 'Paid' || c.status === 'Cancelled');

  const metrics = [
    { label: "Active Queue", value: activeClaims.length, note: "Requires coding or review", tone: "amber" },
    { label: "Pending Claims", value: claims.filter(c => c.status === 'Pending').length, note: "Submitted to insurer", tone: "teal" },
    { label: "Paid & Settled", value: claims.filter(c => c.status === 'Paid').length, note: "Completed claims", tone: "indigo" },
    { label: "Total Claims", value: claims.length, note: "All tracked records", tone: "blue" }
  ];

  if (loading) {
    return (
      <div className="dashboard-page content-page instructor-page">
        <p className="directory-loading">Loading billing and claims workspace...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page content-page instructor-page">
      
      {/* Page Heading */}
      <section className="page-heading">
        <div>
          <p className="section-label">Billing · Administration</p>
          <h1>Billing & Claims Workspace</h1>
          <p>Manage patient claims, track CPT/ICD-10 code selections, and process insurance updates.</p>
        </div>
        <div className="page-heading__actions">
          <button 
            type="button" 
            className="primary-button" 
            onClick={loadDashboardData}
          >
            Refresh Claims
          </button>
        </div>
      </section>

      {/* Feedback / Error Banners */}
      {feedback && (
        <section className="panel directory-action-message directory-success" style={{ marginTop: '16px' }}>
          {feedback}
        </section>
      )}
      {error && (
        <section className="panel directory-action-message directory-error" style={{ marginTop: '16px' }}>
          {error}
        </section>
      )}

      {/* Top Overview Metrics */}
      <section className="instructor-overview-metrics" style={{ marginTop: '24px' }}>
        {metrics.map((metric) => (
          <article className={`panel instructor-overview-metric instructor-overview-metric--${metric.tone}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </section>

      {/* Tabs navigation */}
      <section className="panel classroom-health-panel" style={{ padding: '14px 20px', marginBottom: '18px' }}>
        <div className="roster-controls" style={{ background: 'transparent', border: 'none', padding: 0 }}>
          <div className="roster-controls__tabs">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`roster-view-button ${activeTab === 'queue' ? 'roster-view-button--active' : ''}`}
            >
              Claims Queue ({activeClaims.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`roster-view-button ${activeTab === 'history' ? 'roster-view-button--active' : ''}`}
            >
              Settled / History ({settledClaims.length})
            </button>
          </div>
        </div>
      </section>

      {/* Tab 1: Claims Queue */}
      {activeTab === 'queue' && (
        <section className="panel appointment-page-panel">
          <div className="data-panel__toolbar">
            <div>
              <h2 style={{ margin: 0, fontFamily: 'Manrope, sans-serif', fontSize: '18px', color: '#283350' }}>Active Claims & Coding Queue</h2>
            </div>
            <div className="table-search">
              <input type="text" placeholder="Search claims..." />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service Description</th>
                  <th>Insurance Provider</th>
                  <th>Incident-to Codes (CPT / ICD-10)</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeClaims.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table-cell">No active claims found in the queue.</td>
                  </tr>
                ) : (
                  activeClaims.map(claim => (
                    <tr key={claim.id}>
                      <td>
                        <div>
                          <strong>{claim.service_description}</strong>
                          <small>ID: {claim.id.slice(0, 8)}...</small>
                        </div>
                      </td>
                      <td>{getProviderName(claim.insurance_provider_id)}</td>
                      <td>
                        <code style={{ fontSize: '11px', background: '#f4f6fb', padding: '3px 6px', borderRadius: '4px' }}>
                          CPT: {claim.cpt_code} | ICD-10: {claim.icd10_code}
                        </code>
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${claim.status.toLowerCase()}`}>
                          {claim.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button 
                            type="button" 
                            onClick={() => {
                              setSelectedClaim(claim);
                              setActiveCptCode(claim.cpt_code);
                              setActiveIcd10Code(claim.icd10_code);
                              setIsCodingModalOpen(true);
                            }} 
                            className="outline-button" 
                            style={{ padding: '6px 10px', fontSize: '11px' }}
                          >
                            Edit Codes
                          </button>
                          <button 
                            type="button" 
                            onClick={() => handleUpdateStatus(claim.id, 'Paid')} 
                            className="outline-button" 
                            style={{ padding: '6px 10px', fontSize: '11px' }}
                          >
                            Mark Paid
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 2: Settled / History */}
      {activeTab === 'history' && (
        <section className="panel appointment-page-panel">
          <div className="data-panel__toolbar">
            <div>
              <h2 style={{ margin: 0, fontFamily: 'Manrope, sans-serif', fontSize: '18px', color: '#283350' }}>Completed Claims & Ledger</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Service Rendered</th>
                  <th>Insurance Provider</th>
                  <th>Codes (CPT / ICD-10)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {settledClaims.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table-cell">No settled claims found.</td>
                  </tr>
                ) : (
                  settledClaims.map(claim => (
                    <tr key={claim.id}>
                      <td><code>{claim.id.slice(0, 8)}...</code></td>
                      <td><strong>{claim.service_description}</strong></td>
                      <td>{getProviderName(claim.insurance_provider_id)}</td>
                      <td>
                        <code style={{ fontSize: '11px', background: '#f4f6fb', padding: '3px 6px', borderRadius: '4px' }}>
                          CPT: {claim.cpt_code} | ICD-10: {claim.icd10_code}
                        </code>
                      </td>
                      <td><span className="status-badge status-badge--completed">{claim.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scope Safeguard Notice */}
      <section className="panel scope-rule" style={{ marginTop: '24px', padding: '18px 24px' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '13px', color: '#34405b' }}>Billing Privacy & Access Boundary</h3>
          <p style={{ margin: 0, color: '#8994a7', fontSize: '11px' }}>
            Restricted access level active: Biller roles can view diagnosis codes, CPT procedure selections, and policy details, but clinical narrative notes and behavioral health elements are strictly masked.
          </p>
        </div>
        <span>Secure RBAC Enforced</span>
      </section>

      {/* Code Selection Modal */}
      {isCodingModalOpen && selectedClaim && (
        <div className="account-modal-backdrop">
          <div className="panel account-detail-modal">
            <div className="panel__header">
              <div>
                <p className="section-label">Charge Capture & Coding</p>
                <h2>Edit Incident-to Codes</h2>
              </div>
              <button 
                type="button" 
                className="outline-button" 
                onClick={() => setIsCodingModalOpen(false)}
                style={{ padding: '4px 8px', fontSize: '11px' }}
              >
                Close
              </button>
            </div>
            
            <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                Select the appropriate ICD-10 diagnosis code and CPT procedure code. (Note: Dollar amounts are omitted per educational billing constraints).
              </p>
              
              <div className="soap-field">
                <span>CPT Procedure Code</span>
                <select 
                  value={activeCptCode} 
                  onChange={(e) => setActiveCptCode(e.target.value)}
                >
                  <option value="99211">99211 - Office visit, minimal / nurse visit</option>
                  <option value="99212">99212 - Office visit, straightforward medical decision making</option>
                  <option value="99213">99213 - Office visit, low complexity</option>
                  <option value="99214">99214 - Office visit, moderate complexity</option>
                  <option value="99215">99215 - Office visit, high complexity</option>
                </select>
              </div>

              <div className="soap-field">
                <span>ICD-10 Diagnosis Code</span>
                <select 
                  value={activeIcd10Code} 
                  onChange={(e) => setActiveIcd10Code(e.target.value)}
                >
                  <option value="J02.9">J02.9 - Acute pharyngitis, unspecified</option>
                  <option value="Z00.00">Z00.00 - Encounter for general adult medical examination</option>
                  <option value="R51.9">R51.9 - Headache, unspecified</option>
                  <option value="I10">I10 - Essential (primary) hypertension</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button 
                  type="button" 
                  className="outline-button" 
                  onClick={() => setIsCodingModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="primary-button" 
                  onClick={handleSaveCodes}
                >
                  Save Code Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}