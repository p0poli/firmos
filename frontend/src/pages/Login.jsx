/**
 * Login — full-screen auth surface, dark theme, FirmOS wordmark.
 *
 * Centered card with the brand mark above the form. Uses the design-
 * system Button primitive for the submit so its hover/focus/active
 * states match the rest of the app.
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "../components/ui";
import { login } from "../api";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.message ||
          "Sign-in failed. Check your credentials and try again."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand} aria-hidden="true">
          <span className={styles.brandMark} />
          <span className={styles.brandWord}>FirmOS</span>
        </div>
        <p className={styles.subtitle}>Sign in to continue</p>

        <form onSubmit={submit} className={styles.form} noValidate>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              className={styles.input}
              placeholder="you@firmos.dev"
              disabled={busy}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={styles.input}
              placeholder="••••••••"
              disabled={busy}
            />
          </label>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={busy}
            trailingIcon={!busy && <ArrowRight size={16} />}
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className={styles.footer}>
          Tip: use <code>admin@firmos.dev</code> / <code>admin</code> on a
          fresh install.
        </p>
      </div>
    </div>
  );
}
