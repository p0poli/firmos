/**
 * ProjectGraph — force-directed knowledge graph scoped to a single project.
 *
 * Shows the BFS 2-hop subgraph around the project node.  Includes a
 * project selector, filter pills, search, and a side panel on click.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useNavigate } from "react-router-dom";
import { Brain, ExternalLink, Network, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterPills,
  Skeleton,
} from "../components/ui";
import { getProjectGraph, listProjects } from "../api";
import { usePageTitle } from "../hooks/usePageTitle";
import styles from "./ProjectGraph.module.css";

const NODE_COLORS = {
  project:       "#5865f2",
  task:          "#22c55e",
  file:          "#f59e0b",
  user:          "#a855f7",
  regulation:    "#ef4444",
  insight:       "#06b6d4",
  tag:           "#52525b",
  technique:     "#3b82f6",
  building_type: "#f59e0b",
  location:      "#22c55e",
  knowledge:     "#8b5cf6",
  insight_topic: "#06b6d4",
};

const FILTER_OPTIONS = [
  { key: null,        label: "All" },
  { key: "user",      label: "Team" },
  { key: "task",      label: "Tasks" },
  { key: "file",      label: "Files" },
  { key: "regulation",label: "Checks" },
  { key: "tag",       label: "Regulations" },
  { key: "insight",   label: "Insights" },
];

// Map filter key to actual node_type values
const FILTER_MAP = {
  user:       ["user"],
  task:       ["task"],
  file:       ["file"],
  regulation: ["regulation"],
  tag:        ["regulation", "tag"],
  insight:    ["insight"],
};

const LEGEND_TYPES = [
  { key: "project",       label: "Project" },
  { key: "task",          label: "Task" },
  { key: "file",          label: "File" },
  { key: "user",          label: "User" },
  { key: "regulation",    label: "Regulation/Check" },
  { key: "insight",       label: "Insight" },
  { key: "tag",           label: "Tag" },
  { key: "technique",     label: "Technique" },
  { key: "knowledge",     label: "Knowledge" },
  { key: "location",      label: "Location" },
];

export default function ProjectGraph() {
  usePageTitle("Project Graph");
  const navigate = useNavigate();
  const fgRef = useRef(null);
  const containerRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Load project list on mount
  useEffect(() => {
    listProjects()
      .then((data) => {
        setProjects(data || []);
        if (data && data.length > 0) {
          setSelectedProject(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Load graph when project changes
  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    setError(null);
    setGraphData(null);
    setSelectedId(null);
    getProjectGraph(selectedProject)
      .then((data) => {
        const nodes = (data.nodes || []).map((n) => ({
          id: n.id,
          label: n.label,
          node_type: n.node_type,
          reference_id: n.reference_id,
          description: n.description,
          metadata: n.metadata || {},
          weight: n.weight || 0,
          color: NODE_COLORS[n.node_type] ?? "#9ca3af",
        }));
        const links = (data.edges || []).map((e) => ({
          source: e.source_node_id,
          target: e.target_node_id,
          relationship_type: e.relationship_type,
        }));
        setGraphData({ nodes, links });
      })
      .catch(() => setError("Couldn't load the project graph."))
      .finally(() => setLoading(false));
  }, [selectedProject]);

  // Resize observer
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setSize({ w: Math.max(320, r.width), h: Math.max(360, r.height) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [graphData]);

  const nodeIndex = useMemo(() => {
    if (!graphData) return {};
    return Object.fromEntries(graphData.nodes.map((n) => [n.id, n]));
  }, [graphData]);

  // Apply filter + search
  const filteredGraph = useMemo(() => {
    if (!graphData) return null;

    let visibleNodes = graphData.nodes;

    // Type filter
    if (filter !== null) {
      const types = FILTER_MAP[filter] || [filter];
      visibleNodes = visibleNodes.filter((n) => types.includes(n.node_type));
    }

    // Search filter — fade non-matching nodes
    const q = search.trim().toLowerCase();
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const links = graphData.links.filter((l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return visibleIds.has(s) && visibleIds.has(t);
    });

    // Annotate nodes with search opacity
    const searchNodes = q
      ? visibleNodes.map((n) => ({
          ...n,
          searchMatch: n.label.toLowerCase().includes(q),
        }))
      : visibleNodes.map((n) => ({ ...n, searchMatch: true }));

    return { nodes: searchNodes, links };
  }, [graphData, filter, search]);

  const selectedNode = selectedId ? nodeIndex[selectedId] : null;

  const drawNode = useCallback(
    (node, ctx, globalScale) => {
      const isActive = node.id === hoveredId || node.id === selectedId;
      const opacity = node.searchMatch === false ? 0.2 : 1;
      const radius = isActive ? 8 : 5.5;

      ctx.globalAlpha = opacity;

      if (isActive) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI);
        ctx.fillStyle = `${node.color}40`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.lineWidth = 1.5 / globalScale;
      ctx.strokeStyle = "#0a0a0a";
      ctx.stroke();

      if (isActive) {
        const label = node.label || "(no label)";
        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillText(label, node.x + 1, node.y - radius - 5 + 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, node.x, node.y - radius - 5);
      }

      ctx.globalAlpha = 1;
    },
    [hoveredId, selectedId]
  );

  const drawNodeHitArea = (node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 11, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <select
          className={styles.projectSelect}
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          aria-label="Select project"
        >
          {projects.length === 0 && (
            <option value="">Loading projects…</option>
          )}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          className={styles.searchBox}
          type="search"
          placeholder="Search nodes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search nodes"
        />

        <div className={styles.filterRow}>
          <FilterPills
            options={FILTER_OPTIONS.map((t) => ({
              value: t.key,
              label: t.label,
            }))}
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter graph by node type"
          />
        </div>
      </div>

      <div ref={containerRef} className={styles.canvasShell}>
        {loading && (
          <div className={styles.canvasOverlay}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="80%" height={14} />
          </div>
        )}
        {error && (
          <div className={styles.canvasOverlay}>
            <Card className={styles.errorCard}>{error}</Card>
          </div>
        )}
        {!loading && !error && graphData && filteredGraph && filteredGraph.nodes.length === 0 && (
          <div className={styles.canvasOverlay}>
            <EmptyState
              icon={Network}
              title="No nodes found"
              description="Try a different filter or select another project."
            />
          </div>
        )}
        {!loading && !error && graphData && filteredGraph && filteredGraph.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={filteredGraph}
            width={size.w}
            height={size.h}
            backgroundColor="#0a0a0a"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={drawNodeHitArea}
            nodeLabel={(n) => `${n.node_type}: ${n.label || "(no label)"}`}
            linkColor={() => "rgba(161, 161, 170, 0.18)"}
            linkWidth={0.8}
            linkLabel={(l) => l.relationship_type}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => "rgba(161, 161, 170, 0.45)"}
            onNodeClick={(n) => setSelectedId(n.id === selectedId ? null : n.id)}
            onNodeHover={(n) => setHoveredId(n ? n.id : null)}
            cooldownTicks={100}
            d3VelocityDecay={0.3}
          />
        )}

        {graphData && filteredGraph && filteredGraph.nodes.length > 0 && (
          <div className={styles.legend} aria-label="Node type legend">
            {LEGEND_TYPES.map((t) => (
              <div key={t.key} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ backgroundColor: NODE_COLORS[t.key] }}
                  aria-hidden="true"
                />
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedNode && (
        <NodeDetailPanel
          node={selectedNode}
          links={filteredGraph ? filteredGraph.links : []}
          nodeIndex={nodeIndex}
          onClose={() => setSelectedId(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function NodeDetailPanel({ node, links, nodeIndex, onClose, navigate }) {
  const connections = useMemo(() => {
    const out = [];
    for (const l of links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s !== node.id && t !== node.id) continue;
      const otherId = s === node.id ? t : s;
      const direction = s === node.id ? "out" : "in";
      out.push({
        otherId,
        other: nodeIndex[otherId],
        relationship: l.relationship_type,
        direction,
      });
    }
    return out;
  }, [links, node.id, nodeIndex]);

  const isConceptType = ["regulation", "tag", "knowledge", "technique", "building_type", "location"].includes(node.node_type);

  const openInApp = () => {
    if (node.node_type === "project") {
      navigate(`/project/${node.reference_id}`);
    } else if (node.node_type === "task") {
      const parent = connections.find(
        (c) => c.relationship === "belongs_to" && c.other?.node_type === "project"
      );
      if (parent?.other) {
        navigate(`/project/${parent.other.reference_id}?tab=tasks`);
      }
    } else if (isConceptType) {
      navigate(`/knowledge-web?focus=${node.id}`);
    }
  };

  const canOpen =
    node.node_type === "project" ||
    isConceptType ||
    (node.node_type === "task" &&
      connections.some(
        (c) => c.relationship === "belongs_to" && c.other?.node_type === "project"
      ));

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside className={styles.panel} role="dialog" aria-label="Node details">
        <header className={styles.panelHeader}>
          <span className={styles.panelKind}>
            <span
              className={styles.legendDot}
              style={{ backgroundColor: NODE_COLORS[node.node_type] }}
              aria-hidden="true"
            />
            {node.node_type}
          </span>
          <Button variant="icon" size="sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </header>

        <div className={styles.panelBody}>
          <h2 className={styles.panelTitle}>{node.label || "(no label)"}</h2>

          {node.description && (
            <p className={styles.panelDesc}>{node.description}</p>
          )}

          {node.metadata && Object.keys(node.metadata).length > 0 && (
            <section>
              <h3 className={styles.panelSection}>Metadata</h3>
              <dl className={styles.metaList}>
                {Object.entries(node.metadata).map(([k, v]) => (
                  <div key={k} className={styles.metaRow}>
                    <dt>{k}</dt>
                    <dd>{formatMetaValue(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section>
            <h3 className={styles.panelSection}>
              Connections{" "}
              <span className={styles.panelSectionCount}>{connections.length}</span>
            </h3>
            {connections.length === 0 ? (
              <p className={styles.panelEmpty}>No connections in current view.</p>
            ) : (
              <ul className={styles.connList}>
                {connections.map((c, i) => (
                  <li key={i} className={styles.connRow}>
                    <span
                      className={styles.connDot}
                      style={{ backgroundColor: NODE_COLORS[c.other?.node_type] ?? "#9ca3af" }}
                      aria-hidden="true"
                    />
                    <Badge variant="neutral" size="sm">
                      {(c.relationship || "").replace(/_/g, " ")}
                    </Badge>
                    <span className={styles.connArrow}>{c.direction === "out" ? "→" : "←"}</span>
                    <span className={styles.connLabel}>{c.other?.label || c.otherId?.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canOpen && (
            <div className={styles.panelActions}>
              <Button
                variant="primary"
                size="md"
                leadingIcon={isConceptType ? <Brain size={14} /> : <ExternalLink size={14} />}
                onClick={openInApp}
              >
                {isConceptType
                  ? "See in Knowledge Web →"
                  : node.node_type === "project"
                  ? "Open Project →"
                  : "Open Tasks →"}
              </Button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function formatMetaValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
