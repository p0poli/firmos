/**
 * MyWorld — personalized knowledge graph centered on the current user.
 *
 * Shows projects, tasks, colleagues, insights, and concept nodes
 * radiating out from the "me" node.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Card, EmptyState, Skeleton } from "../components/ui";
import { getMyWorld, updateTask, createTimelog } from "../api";
import { useUser } from "../contexts/UserContext";
import { usePageTitle } from "../hooks/usePageTitle";
import styles from "./MyWorld.module.css";

const NODE_COLORS = {
  me:         "#5865f2",
  project:    "#5865f2",
  task:       "#22c55e",
  colleague:  "#a855f7",
  regulation: "#ef4444",
  tag:        "#52525b",
  insight:    "#06b6d4",
  knowledge:  "#8b5cf6",
};

const NODE_RADIUS = {
  me:         20,
  project:    12,
  task:       6,
  colleague:  7,
  regulation: 5,
  tag:        4,
  insight:    6,
  knowledge:  6,
};

const FILTER_OPTIONS = [
  { key: null,       label: "All" },
  { key: "project",  label: "Projects" },
  { key: "task",     label: "Tasks" },
  { key: "colleague",label: "Team" },
  { key: "insight",  label: "Insights" },
];

// Initials from a name/email string
function initials(nameOrEmail) {
  if (!nameOrEmail) return "?";
  const parts = nameOrEmail.split(/[\s@.]+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export default function MyWorld() {
  usePageTitle("My World");
  const navigate = useNavigate();
  const { user } = useUser();
  const fgRef = useRef(null);
  const containerRef = useRef(null);

  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Modal state
  const [showTimelogModal, setShowTimelogModal] = useState(false);
  const [timelogTask, setTimelogTask] = useState(null);

  useEffect(() => {
    getMyWorld()
      .then((data) => {
        setRawData(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Couldn't load your personal graph.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [rawData]);

  const filteredGraph = useMemo(() => {
    if (!rawData) return null;
    const q = search.trim().toLowerCase();

    let nodes = rawData.nodes;
    if (filter && filter !== "me") {
      const meNode = rawData.nodes.find((n) => n.node_type === "me");
      const allowedTypes = new Set([filter, "me", "project"]);
      nodes = nodes.filter((n) => allowedTypes.has(n.node_type));
    }
    if (q) {
      nodes = nodes.filter((n) =>
        n.node_type === "me" || n.label.toLowerCase().includes(q)
      );
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links = rawData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ ...e }));

    return {
      nodes: nodes.map((n) => ({
        ...n,
        color: NODE_COLORS[n.node_type] ?? "#9ca3af",
        r: NODE_RADIUS[n.node_type] ?? 6,
      })),
      links,
    };
  }, [rawData, filter, search]);

  const drawNode = useCallback(
    (node, ctx, globalScale) => {
      const r = node.r || 6;
      const color = node.color;
      const isHovered = node.id === hoveredId;
      const isSelected = selectedNode && node.id === selectedNode.id;
      const isMe = node.node_type === "me";

      // Glow
      if (isMe || isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 2.2, 0, 2 * Math.PI);
        ctx.fillStyle = `${color}20`;
        ctx.fill();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Border for me node
      if (isMe) {
        ctx.lineWidth = 2 / globalScale;
        ctx.strokeStyle = "#ffffff50";
        ctx.stroke();

        // Initials inside
        const fontSize = Math.max(8, r * 0.7);
        ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(initials(node.label), node.x, node.y);
      }

      // Label for larger nodes or hovered/selected
      if (!isMe && (isHovered || isSelected || r >= 10 || (globalScale > 2 && r >= 6))) {
        const label = node.label.length > 20 ? node.label.slice(0, 17) + "…" : node.label;
        const fontSize = Math.max(8, 10 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillText(label, node.x + 0.5, node.y - r - 3 + 0.5);
        ctx.fillStyle = "#e5e5e5";
        ctx.fillText(label, node.x, node.y - r - 3);
      }
    },
    [hoveredId, selectedNode]
  );

  const drawNodeHitArea = (node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, Math.max((node.r || 6) + 6, 12), 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  };

  const handleNodeClick = useCallback(
    (node) => {
      if (selectedNode && node.id === selectedNode.id) {
        setSelectedNode(null);
      } else {
        setSelectedNode(node);
      }
    },
    [selectedNode]
  );

  const handleMarkDone = async (taskNode) => {
    const taskId = taskNode.metadata?.ref;
    if (!taskId) return;
    try {
      await updateTask(taskId, { status: "done" });
      // Refresh graph
      const data = await getMyWorld();
      setRawData(data);
      setSelectedNode(null);
    } catch {
      // ignore
    }
  };

  // Floating card content
  const renderFloatingCard = () => {
    if (!selectedNode) return null;
    const n = selectedNode;

    if (n.node_type === "task") {
      return (
        <div className={styles.floatingCard}>
          <header className={styles.floatingCardHeader}>
            <span className={styles.floatingType} style={{ color: NODE_COLORS.task }}>
              Task
            </span>
            <button className={styles.floatingClose} onClick={() => setSelectedNode(null)}>
              <X size={14} />
            </button>
          </header>
          <h3 className={styles.floatingTitle}>{n.label}</h3>
          {n.metadata?.status && (
            <p className={styles.floatingMeta}>
              Status: <strong>{n.metadata.status}</strong>
            </p>
          )}
          {n.metadata?.due_date && (
            <p className={styles.floatingMeta}>
              Due: <strong>{n.metadata.due_date}</strong>
            </p>
          )}
          <div className={styles.floatingActions}>
            <button
              className={styles.floatingBtn}
              onClick={() => handleMarkDone(n)}
              disabled={n.metadata?.status === "done"}
            >
              Mark done
            </button>
            <button
              className={styles.floatingBtn}
              onClick={() => {
                setTimelogTask(n);
                setShowTimelogModal(true);
              }}
            >
              Log time
            </button>
          </div>
        </div>
      );
    }

    if (n.node_type === "project") {
      const refId = n.metadata?.ref;
      return (
        <div className={styles.floatingCard}>
          <header className={styles.floatingCardHeader}>
            <span className={styles.floatingType} style={{ color: NODE_COLORS.project }}>
              Project
            </span>
            <button className={styles.floatingClose} onClick={() => setSelectedNode(null)}>
              <X size={14} />
            </button>
          </header>
          <h3 className={styles.floatingTitle}>{n.label}</h3>
          {n.metadata?.status && (
            <p className={styles.floatingMeta}>
              Status: <strong>{n.metadata.status}</strong>
            </p>
          )}
          {refId && (
            <div className={styles.floatingActions}>
              <button
                className={styles.floatingBtn}
                onClick={() => navigate(`/project/${refId}`)}
              >
                Open in Vitruvius
              </button>
            </div>
          )}
        </div>
      );
    }

    if (n.node_type === "colleague") {
      // Find shared projects
      const sharedProjects = rawData?.nodes
        .filter((pn) => {
          if (pn.node_type !== "project") return false;
          const hasMe = rawData.edges.some(
            (e) => (e.source === pn.id && e.target.startsWith("me_")) ||
                    (e.target === pn.id && e.source.startsWith("me_"))
          );
          const hasColleague = rawData.edges.some(
            (e) => (e.source === pn.id && e.target === n.id) ||
                    (e.target === pn.id && e.source === n.id)
          );
          return hasMe && hasColleague;
        })
        .map((pn) => pn.label)
        .slice(0, 3);

      return (
        <div className={styles.floatingCard}>
          <header className={styles.floatingCardHeader}>
            <span className={styles.floatingType} style={{ color: NODE_COLORS.colleague }}>
              Colleague
            </span>
            <button className={styles.floatingClose} onClick={() => setSelectedNode(null)}>
              <X size={14} />
            </button>
          </header>
          <h3 className={styles.floatingTitle}>{n.label}</h3>
          {n.metadata?.role && (
            <p className={styles.floatingMeta}>Role: <strong>{n.metadata.role}</strong></p>
          )}
          {n.metadata?.email && (
            <p className={styles.floatingMeta}>{n.metadata.email}</p>
          )}
          {sharedProjects && sharedProjects.length > 0 && (
            <p className={styles.floatingMeta}>
              Shared projects: {sharedProjects.map((p, i) => (
                <strong key={i}>{p}{i < sharedProjects.length - 1 ? ", " : ""}</strong>
              ))}
            </p>
          )}
        </div>
      );
    }

    if (n.node_type === "knowledge" || n.node_type === "regulation" || n.node_type === "tag") {
      const knId = n.metadata?.kn_id;
      return (
        <div className={styles.floatingCard}>
          <header className={styles.floatingCardHeader}>
            <span
              className={styles.floatingType}
              style={{ color: NODE_COLORS[n.node_type] ?? "#9ca3af" }}
            >
              {n.node_type}
            </span>
            <button className={styles.floatingClose} onClick={() => setSelectedNode(null)}>
              <X size={14} />
            </button>
          </header>
          <h3 className={styles.floatingTitle}>{n.label}</h3>
          {knId && (
            <div className={styles.floatingActions}>
              <button
                className={styles.floatingBtn}
                onClick={() => navigate(`/knowledge-web?focus=${knId}`)}
              >
                Explore in Knowledge Web →
              </button>
            </div>
          )}
        </div>
      );
    }

    if (n.node_type === "insight") {
      return (
        <div className={styles.floatingCard}>
          <header className={styles.floatingCardHeader}>
            <span className={styles.floatingType} style={{ color: NODE_COLORS.insight }}>
              Insight
            </span>
            <button className={styles.floatingClose} onClick={() => setSelectedNode(null)}>
              <X size={14} />
            </button>
          </header>
          <h3 className={styles.floatingTitle}>{n.label}</h3>
          {n.metadata?.type && (
            <p className={styles.floatingMeta}>Type: <strong>{n.metadata.type}</strong></p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div ref={containerRef} className={styles.page}>
      {/* Floating search */}
      <div className={styles.floatingSearch}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search your world…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search nodes"
        />
      </div>

      {/* Floating filter pills */}
      <div className={styles.floatingFilters}>
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={String(opt.key)}
            className={`${styles.filterPill} ${filter === opt.key ? styles.filterPillActive : ""}`}
            onClick={() => setFilter(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Graph */}
      {loading && (
        <div className={styles.overlay}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="80%" height={14} />
        </div>
      )}
      {error && (
        <div className={styles.overlay}>
          <Card className={styles.errorCard}>{error}</Card>
        </div>
      )}
      {!loading && !error && filteredGraph && filteredGraph.nodes.length <= 1 && (
        <div className={styles.overlay}>
          <EmptyState
            title="Your world is empty"
            description="Join projects and get assigned tasks to populate your personal graph."
          />
        </div>
      )}
      {!loading && !error && filteredGraph && filteredGraph.nodes.length > 1 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={filteredGraph}
          width={size.w}
          height={size.h}
          backgroundColor="#030303"
          nodeCanvasObject={drawNode}
          nodePointerAreaPaint={drawNodeHitArea}
          nodeLabel={(n) => `${n.node_type}: ${n.label}`}
          linkColor={() => "#ffffff10"}
          linkWidth={0.6}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.003}
          onNodeClick={handleNodeClick}
          onNodeHover={(n) => setHoveredId(n ? n.id : null)}
          cooldownTicks={120}
          d3VelocityDecay={0.4}
          d3AlphaDecay={0.02}
          onEngineStop={() => {
            // Center me node on initial layout
            if (fgRef.current) {
              const meNode = filteredGraph.nodes.find((n) => n.node_type === "me");
              if (meNode && meNode.x != null) {
                fgRef.current.centerAt(meNode.x, meNode.y, 800);
              }
            }
          }}
        />
      )}

      {/* Floating node card */}
      {selectedNode && renderFloatingCard()}

      {/* Timelog modal */}
      {showTimelogModal && timelogTask && (
        <TaskLogModal
          task={timelogTask}
          onClose={() => {
            setShowTimelogModal(false);
            setTimelogTask(null);
          }}
        />
      )}
    </div>
  );
}

// --- Task Log Modal ---

function TaskLogModal({ task, onClose }) {
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const taskId = task.metadata?.ref;
    if (!taskId || !minutes) return;
    setSaving(true);
    try {
      await createTimelog(taskId, {
        duration_minutes: parseInt(minutes, 10),
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalScrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Log time</h2>
          <button className={styles.closeModalBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <p className={styles.modalSubtitle}>{task.label}</p>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.formLabel}>
            Duration (minutes)
            <input
              className={styles.formInput}
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="e.g. 60"
              required
              autoFocus
            />
          </label>
          <label className={styles.formLabel}>
            Notes
            <textarea
              className={styles.formTextarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </label>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={saving || !minutes}
            >
              {saving ? "Saving…" : "Log time"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
