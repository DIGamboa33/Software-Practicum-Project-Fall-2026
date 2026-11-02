import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { fetchRoles, loginUser } from "../lib/api";

function describeSupabaseError(error) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const databaseError = error;
    return [
      databaseError.code,
      databaseError.message,
      databaseError.details,
      databaseError.hint,
    ]
      .filter(Boolean)
      .join(" — ");
  }

  return String(error || "Unknown Supabase error");
}

function LoginPage({ onLogin }) {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [roles, setRoles] = useState([]);
  const [rolesStatus, setRolesStatus] = useState("loading");
  const [rolesError, setRolesError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadRoles() {
      try {
        const roleRows = await fetchRoles();
        if (isCurrent) {
          setRoles(roleRows);
          setRolesStatus("ready");
        }
      } catch (fetchError) {
        if (isCurrent) {
          setRolesError(describeSupabaseError(fetchError));
          setRolesStatus("error");
        }
      }
    }

    loadRoles();
    return () => {
      isCurrent = false;
    };
  }, []);

async function handleSubmit(event) {
  event.preventDefault();
  setError("");

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      setError(data.message || "Failed to sign in.");
      return;
    }

   
    onLogin(data);
  } catch (err) {
    setError("Network error. Please try again.");
  }
}

  return (
    <main className="login-page">
      <section className="login-page__aside">
        <div className="login-brand">
          <span className="brand-mark">+</span> Careflow
        </div>
        <div className="login-page__message">
          <div className="team-no">
            <p>
              Team 4:<br></br>
              Anaiah Quinn<br></br>
              Christian Revilla<br></br>
              Derek Gamboa<br></br>
              Francisco Vazquez<br></br>
              Jazmin Huerta
            </p>
          </div>
        </div>
      </section>
      <section className="login-page__form-area">
        <div className="login-card">
          <p className="section-label">Welcome back</p>
          <h2>Sign in to Careflow</h2>
          <p className="login-card__intro">
            Sign in with your Careflow account to continue.
          </p>
          {searchParams.get("registered") === "1" && (
            <p className="registration-success" role="status">
              Your account has been created. Sign in with your new credentials.
            </p>
          )}
          <form onSubmit={handleSubmit}>
            <label>
              Email address
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button className="login-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in…" : "Sign in to dashboard"} <span>→</span>
            </button>
          </form>
         
          {/*<section className="database-status" aria-live="polite">
            <strong>Supabase role lookup</strong>
            {rolesStatus === "loading" && <span>Loading roles…</span>}
            {rolesStatus === "ready" && (
              <div className="database-status__roles">
                {roles.map((role) => (
                  <span key={role.id}>{role.name}</span>
                ))}
              </div>
            )}
            {rolesStatus === "error" && (
              <>
                <span>
                  Unable to read roles. Confirm that the roles are seeded and
                  the read policy below has been created.
                </span>
                <code>{rolesError}</code>
              </>
            )}
          </section>*/}
          <p className="auth-switch">
            Need a Student account? <Link to="/register">Register now</Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
