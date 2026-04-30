import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getActiveSessions,
  getRecentChecks,
  getRecentInsights,
  listProjects,
} from "../api";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [checks, setChecks] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      listProjects("active").catch(() => []),
      getActiveSessions().catch(() => []),
      getRecentChecks(5).catch(() => []),
      getRecentInsights(5).catch(() => []),
    ])
      .then(([p, s, c, i]) => {
        setProjects(p);
        setSessions(s);
        setChecks(c);
        setInsights(i);
      })
      .catch(() => setError("Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted">Loading…</div>;
  if (error) return <div className="login-error">{error}</div>;

  return (
    <div>
      <h2>Dashboard</h2>
      <div className="grid-2">
        <div className="card">
          <h3>Active projects ({projects.length})</h3>
          {projects.length === 0 ? (
            <p className="muted">No active projects yet.</p>
          ) : (
            projects.slice(0, 5).map((p) => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <Link to={`/project/${p.id}`}>{p.name}</Link>{" "}
                <span className="muted">
                  · {p.status}
                  {p.deadline ? ` · due ${p.deadline}` : ""}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3>Active sessions ({sessions.length})</h3>
          {sessions.length === 0 ? (
            <p className="muted">No one is currently logged in.</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id} style={{ marginBottom: 8 }}>
                <strong>{s.user_name}</strong>{" "}
                <span className="muted">
                  · since {fmt(s.login_time)}
                  {s.active_project_name
                    ? ` · on ${s.active_project_name}`
                    : ""}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3>Recent check results</h3>
          {checks.length === 0 ? (
            <p className="muted">No checks recorded yet.</p>
          ) : (
            checks.map((c) => (
              <div key={c.id} style={{ marginBottom: 8 }}>
                <strong>{c.check_type}</strong>{" "}
                <span
                  style={{
                    color:
                      c.status === "pass"
                        ? "#22c55e"
                        : c.status === "warning"
                        ? "#eab308"
                        : "#ef4444",
                  }}
                >
                  {c.status}
                </span>{" "}
                <span className="muted">· {fmt(c.timestamp)}</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3>Latest AI insights</h3>
          {insights.length === 0 ? (
            <p className="muted">No insights generated yet.</p>
          ) : (
            insights.map((i) => (
              <div key={i.id} style={{ marginBottom: 10 }}>
                <strong>{i.type}</strong>
                <div className="muted" style={{ fontSize: "0.85rem" }}>
                  {fmt(i.timestamp)}
                </div>
                <div>{i.content}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
