import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Icon from "../components/Icon";
import Pagination from "../components/Pagination";
import {
  fetchAdminAccessOptions,
  fetchAdminAuditLog,
  fetchAdminUsers,
  inviteAdminUser,
  requestAdminPasswordReset,
  updateAdminUserAccess,
  updateAdminUserStatus,
} from "../lib/api";

function formatDate(value) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function AdminUserDirectoryPage() {
  const [directory, setDirectory] = useState({ users: [], stats: null });
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userPage, setUserPage] = useState(1);
  const [usersPerPage, setUsersPerPage] = useState(10);
  const [accessOptions, setAccessOptions] = useState({ roles: [], subroles: [] });
  const [auditEntries, setAuditEntries] = useState([]);
  const [managementError, setManagementError] = useState("");
  const [managementNotice, setManagementNotice] = useState("");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    utepId: "",
    roleId: "",
    subroleId: "",
  });
  const [accessDraft, setAccessDraft] = useState({ userId: "", roleId: "", subroleId: "" });

  useEffect(() => {
    let isCurrent = true;

    async function loadDirectory() {
      setStatus("loading");
      setError("");
      try {
        const result = await fetchAdminUsers(activeQuery);
        if (isCurrent) {
          setDirectory(result);
          setStatus("ready");
        }
      } catch (directoryError) {
        if (isCurrent) {
          setError(
            directoryError instanceof Error
              ? directoryError.message
              : "Unable to load the user directory.",
          );
          setStatus("error");
        }
      }
    }

    loadDirectory();
    return () => {
      isCurrent = false;
    };
  }, [activeQuery]);

  useEffect(() => {
    let isCurrent = true;
    async function loadManagementData() {
      try {
        const [options, audit] = await Promise.all([
          fetchAdminAccessOptions(),
          fetchAdminAuditLog(),
        ]);
        if (isCurrent) {
          setAccessOptions(options);
          setAuditEntries(audit);
        }
      } catch (loadError) {
        if (isCurrent) {
          setManagementError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load account-management settings.",
          );
        }
      }
    }
    loadManagementData();
    return () => {
      isCurrent = false;
    };
  }, []);

  const selectedUser = directory.users.find((user) => user.id === selectedUserId) || null;
  const selectedRole = accessOptions.roles.find((role) => role.name === selectedUser?.role);
  const selectedSubrole = accessOptions.subroles.find(
    (subrole) => subrole.name === selectedUser?.subrole,
  );
  const selectedAccessDraft =
    accessDraft.userId === selectedUser?.id
      ? accessDraft
      : {
          userId: selectedUser?.id || "",
          roleId: selectedRole ? String(selectedRole.id) : "",
          subroleId: selectedSubrole ? String(selectedSubrole.id) : "",
        };

  function handleSearch(event) {
    event.preventDefault();
    setActiveQuery(queryInput.trim());
    setUserPage(1);
  }

  const visibleUsers = directory.users.slice(
    (userPage - 1) * usersPerPage,
    userPage * usersPerPage,
  );

  async function refreshManagement() {
    const [users, audit] = await Promise.all([
      fetchAdminUsers(activeQuery),
      fetchAdminAuditLog(),
    ]);
    setDirectory(users);
    setAuditEntries(audit);
  }

  async function runManagementAction(action) {
    setIsSaving(true);
    setManagementError("");
    setManagementNotice("");
    try {
      const result = await action();
      setManagementNotice(result.message);
      await refreshManagement();
    } catch (actionError) {
      setManagementError(
        actionError instanceof Error ? actionError.message : "Unable to complete this action.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function updateInviteField(field, value) {
    setInviteForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "firstName" || field === "lastName") {
        const first = (field === "firstName" ? value : current.firstName)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ".");
        const last = (field === "lastName" ? value : current.lastName)
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ".");
        next.email = first && last ? `${first}.${last}@careflow.test` : "";
      }
      return next;
    });
  }

  function handleInvite(event) {
    event.preventDefault();
    runManagementAction(async () => {
      const result = await inviteAdminUser(inviteForm);
      setInviteForm({
        firstName: "",
        lastName: "",
        email: "",
        utepId: "",
        roleId: "",
        subroleId: "",
      });
      setIsInviteOpen(false);
      return result;
    });
  }

  return (
    <div className="dashboard-page content-page admin-directory-page">
      <section className="page-heading">
        <div>
          <p className="section-label">Administration · protected directory</p>
          <h1>Global user search</h1>
          <p>
            Search account profiles, role assignments, and identifiers across
            Careflow. Passwords and secret credentials are never displayed.
          </p>
        </div>
        <button className="primary-button directory-create-button" onClick={() => setIsInviteOpen(true)} type="button">
          <Icon name="plus" size={16} /> Invite account
        </button>
      </section>

      {(managementError || managementNotice) && (
        <section
          className={`panel directory-action-message ${managementError ? "directory-error" : "directory-success"}`}
          role="status"
        >
          {managementError || managementNotice}
        </section>
      )}

      {isInviteOpen && (
        <section className="panel invite-account-panel">
          <div className="panel__header">
            <div>
              <p className="section-label">New learner or account</p>
              <h2>Send an account invitation</h2>
            </div>
            <button
              aria-label="Close invitation form"
              className="row-action"
              onClick={() => setIsInviteOpen(false)}
              type="button"
            >
              <Icon name="close" size={17} />
            </button>
          </div>
          <p className="invite-account-panel__intro">
            Careflow creates the identity and sends a secure account-setup email. No password is created or shown here.
          </p>
          <form className="admin-form" onSubmit={handleInvite}>
            <label>
              First name
              <input onChange={(event) => updateInviteField("firstName", event.target.value)} required value={inviteForm.firstName} />
            </label>
            <label>
              Last name
              <input onChange={(event) => updateInviteField("lastName", event.target.value)} required value={inviteForm.lastName} />
            </label>
            <label>
              Careflow email
              <input readOnly value={inviteForm.email} />
            </label>
            <label>
              UTEP ID <span>Optional</span>
              <input onChange={(event) => updateInviteField("utepId", event.target.value)} value={inviteForm.utepId} />
            </label>
            <label>
              Account role
              <select onChange={(event) => updateInviteField("roleId", event.target.value)} required value={inviteForm.roleId}>
                <option value="">Choose a role</option>
                {accessOptions.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
            <label>
              Discipline <span>Optional</span>
              <select onChange={(event) => updateInviteField("subroleId", event.target.value)} value={inviteForm.subroleId}>
                <option value="">No discipline assigned</option>
                {accessOptions.subroles.map((subrole) => <option key={subrole.id} value={subrole.id}>{subrole.name}</option>)}
              </select>
            </label>
            <div className="admin-form__actions">
              <button className="secondary-button" onClick={() => setIsInviteOpen(false)} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "Sending…" : "Send invitation"}</button>
            </div>
          </form>
        </section>
      )}

      <form className="directory-search" onSubmit={handleSearch}>
        <Icon name="search" size={18} />
        <input
          aria-label="Search all users"
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search name, Careflow ID, UTEP ID, email, role, or subrole"
          value={queryInput}
        />
        <button className="primary-button" type="submit">
          Search <Icon name="arrow" size={15} />
        </button>
      </form>

      {status === "error" && (
        <section className="panel directory-error" role="alert">
          {error}
        </section>
      )}

      {directory.stats && (
        <section className="directory-metrics">
          <article className="panel">
            <span>Total accounts</span>
            <strong>{directory.stats.totalUsers}</strong>
            <small>Supabase Auth users</small>
          </article>
          <article className="panel">
            <span>New this week</span>
            <strong>{directory.stats.newThisWeek}</strong>
            <small>Created in the last seven days</small>
          </article>
          <article className="panel">
            <span>Discipline assigned</span>
            <strong>{directory.stats.usersWithSubrole}</strong>
            <small>Profiles with a subrole</small>
          </article>
        </section>
      )}

      <section className="directory-layout">
        <article className="panel directory-table-panel">
          <div className="panel__header">
            <div>
              <p className="section-label">Live account directory</p>
              <h2>
                {activeQuery
                  ? `Search results · ${directory.users.length}`
                  : "All accounts"}
              </h2>
            </div>
            <span className="directory-live-indicator">● Live database</span>
          </div>
          {status === "loading" ? (
            <p className="directory-loading">Loading account records…</p>
          ) : directory.users.length === 0 ? (
            <p className="directory-loading">No user records match this search.</p>
          ) : (
            <>
              <div className="table-wrap admin-scroll-table">
                <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Subrole</th>
                    <th>UTEP ID</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr
                      className={
                        selectedUser?.id === user.id
                          ? "directory-row--selected"
                          : ""
                      }
                      key={user.id}
                    >
                      <td>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </td>
                      <td>
                        <span className="status-badge status-badge--active">
                          {user.role || "Unassigned"}
                        </span>
                      </td>
                      <td>{user.subrole || "—"}</td>
                      <td>{user.utepId || "—"}</td>
                      <td>
                        <button
                          aria-label={`View ${user.name}`}
                          className="row-action"
                          onClick={() => setSelectedUserId(user.id)}
                          type="button"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <Pagination
                currentPage={userPage}
                itemLabel="accounts"
                onPageChange={setUserPage}
                onPageSizeChange={(nextPageSize) => {
                  setUsersPerPage(nextPageSize);
                  setUserPage(1);
                }}
                pageSize={usersPerPage}
                totalItems={directory.users.length}
              />
            </>
          )}
        </article>

        <aside className="directory-sidebar">
          <article className="panel role-chart">
            <p className="section-label">Role distribution</p>
            <h2>Account mix</h2>
            {(directory.stats?.roleBreakdown || []).length ? (
              <div className="admin-visual-canvas admin-visual-canvas--compact">
                <ResponsiveContainer height="100%" width="100%">
                  <BarChart
                    data={directory.stats.roleBreakdown}
                    layout="vertical"
                    margin={{ left: -16, right: 12, top: 8, bottom: 2 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#edf0f5" />
                    <XAxis allowDecimals={false} type="number" />
                    <YAxis dataKey="name" tick={{ fontSize: 12 }} type="category" width={74} />
                    <Tooltip formatter={(value) => [`${value} accounts`, "Users"]} />
                    <Bar dataKey="count" fill="#6277d8" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="directory-loading">Role distribution will appear once accounts are created.</p>
            )}
          </article>

          <article className="panel audit-log">
            <p className="section-label">Protected activity</p>
            <h2>Recent account audit</h2>
            {auditEntries.length ? (
              <ul>
                {auditEntries.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.action.replaceAll(".", " ")}</strong>
                    <span>{formatDate(entry.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="directory-loading">No account-management activity recorded yet.</p>
            )}
          </article>
        </aside>
      </section>

      {selectedUser && (
        <section
          aria-label={`Account details for ${selectedUser.name}`}
          className="account-modal-backdrop"
          onMouseDown={() => setSelectedUserId(null)}
          role="presentation"
        >
          <article
            aria-modal="true"
            className="panel account-detail account-detail-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel__header">
              <div>
                <p className="section-label">Account profile</p>
                <h2>{selectedUser.name}</h2>
              </div>
              <button
                aria-label="Close account details"
                className="row-action"
                onClick={() => setSelectedUserId(null)}
                type="button"
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <p className="account-detail__email">{selectedUser.email}</p>
            <dl>
              <div><dt>Role</dt><dd>{selectedUser.role || "Unassigned"}</dd></div>
              <div><dt>Subrole</dt><dd>{selectedUser.subrole || "Not assigned"}</dd></div>
              <div><dt>UTEP ID</dt><dd>{selectedUser.utepId || "Not provided"}</dd></div>
              <div><dt>Careflow ID</dt><dd>{selectedUser.careflowId || "Not created"}</dd></div>
              <div><dt>Auth user ID</dt><dd>{selectedUser.id}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(selectedUser.createdAt)}</dd></div>
            </dl>
            <p className="account-detail__note">Passwords, password hashes, and authentication tokens are never available in this directory.</p>
            {selectedUser.role === "Admin" ? (
              <p className="account-detail__note">Admin access is protected from changes in this workspace. Use a future Super Admin process for Admin role assignments.</p>
            ) : (
              <form
                className="admin-form admin-form--compact"
                onSubmit={(event) => {
                  event.preventDefault();
                  runManagementAction(() => updateAdminUserAccess(selectedUser.id, selectedAccessDraft));
                }}
              >
                <p className="section-label">Manage access</p>
                <label>
                  Account role
                  <select onChange={(event) => setAccessDraft({ ...selectedAccessDraft, roleId: event.target.value })} required value={selectedAccessDraft.roleId}>
                    <option value="">Choose a role</option>
                    {accessOptions.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
                <label>
                  Discipline
                  <select onChange={(event) => setAccessDraft({ ...selectedAccessDraft, subroleId: event.target.value })} value={selectedAccessDraft.subroleId}>
                    <option value="">No discipline assigned</option>
                    {accessOptions.subroles.map((subrole) => <option key={subrole.id} value={subrole.id}>{subrole.name}</option>)}
                  </select>
                </label>
                <button className="secondary-button" disabled={isSaving || !selectedAccessDraft.roleId} type="submit">Save access</button>
                <div className="admin-form__inline-actions">
                  <button className="text-button" disabled={isSaving} onClick={() => runManagementAction(() => requestAdminPasswordReset(selectedUser.id))} type="button">Send password reset</button>
                  <button className="text-button text-button--danger" disabled={isSaving} onClick={() => runManagementAction(() => updateAdminUserStatus(selectedUser.id, !selectedUser.isActive))} type="button">
                    {selectedUser.isActive ? "Deactivate account" : "Reactivate account"}
                  </button>
                </div>
              </form>
            )}
          </article>
        </section>
      )}
    </div>
  );
}

export default AdminUserDirectoryPage;
