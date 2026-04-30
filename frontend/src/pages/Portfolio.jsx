import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProjects } from "../api";

const STATUSES = ["active", "on-hold", "completed", "archived"];

const STATUS_COLORS = {
  active: "#22c55e",
  "on-hold": "#eab308",
  completed: "#6ea8fe",
  archived: "#8a8d96",
};

export default function Portfolio() {
  const [filter, setFilter] = useState("");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listProjects(filter || undefined)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [filter]);

  const btnStyle = (active) => ({
    padding: "0.4rem 0.8rem",
    marginRight: 6,
    background: active ? "#2563eb" : "transparent",
    border: "1px solid #25272e",
    borderRadius: 6,
    color: "#e8e8e8",
  });

  return (
    <div>
      <h2>Portfolio</h2>
      <div style={{ marginBottom: "1.25rem" }}>
        <button style={btnStyle(filter === "")} onClick={() => setFilter("")}>
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            style={btnStyle(filter === s)}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="muted">No projects match this filter.</p>
      ) : (
        <div className="grid-2">
          {projects.map((p) => (
            <Link
              to={`/project/${p.id}`}
              key={p.id}
              className="card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <h3>{p.name}</h3>
              <div
                className="muted"
                style={{ color: STATUS_COLORS[p.status] || "#8a8d96" }}
              >
                {p.status}
              </div>
              {p.description && (
                <p style={{ marginTop: 8 }}>{p.description}</p>
              )}
              {p.deadline && (
                <p className="muted" style={{ marginTop: 8 }}>
                  Deadline: {p.deadline}
                </p>
              )}
              <p className="muted" style={{ marginTop: 4 }}>
                {p.members?.length || 0} member
                {p.members?.length === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
