/**
 * KnowledgeGraph — force-directed view of every entity (projects, tasks,
 * files, checks, insights, tags) and the edges between them.
 *
 * The graph is rendered with react-force-graph-2d. We supply a custom
 * nodeCanvasObject so we can draw a halo around the hovered/selected
 * node, and a nodePointerAreaPaint so the hit target is bigger than the
 * visible dot — much friendlier to click than the library defaults.
 *
 * Filtering is purely client-side over the already-loaded graph: hide
 * nodes of the non-matching type and drop edges that touch them.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Network, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterPills,
  Skeleton,
} from "../components/ui";
import { getKnowledgeGraph } from "../api";
import styles from "./KnowledgeGraph.module.css";

// Color mapping is duplicated as raw hex (rather than var()) because the
// canvas painter can't resolve CSS variables at draw time. The values
// mirror the design tokens; if a token color changes, update both.
const NODE_COLORS = {
  project: "#5865f2",   // --color-primary
  task: "#22c55e",      // --color-success
  file: "#f59e0b",      // --color-warning
  user: "#a855f7",      // purple (matches ACC source-badge override)
  regulation: "#ef4444", // --color-danger (CheckResults render as regulation nodes)
  insight: "#06b6d4",   // cyan
  tag: "#52525b",       // --color-text-muted
};

// Which types appear in the filter pill row (and in what order). User
// nodes exist in the graph but rarely justify a top-level filter, so
// they're hidden from the pills but still included in the legend.
const FILTER_TYPES = [
  { key: null, label: "All" },
  { key: "project", label: "Projects" },
  { key: "task", label: "Tasks" },
  { key: "file", label: "Files" },
  { key: "regulation", label: "Checks" },
  { key: "insight", label: "Insights" },
  { key: "tag", label: "Tags" },
];

// All types — used to build the legend at the bottom of the canvas.
const LEGEND_TYPES = [
  { key: "project", label: "Project" },
  { key: "task", label: "Task" },
  { key: "file", label: "File" },
  { key: "user", label: "User" },
  { key: "regulation", label: "Check" },
  { key: "insight", label: "Insight" },
  { key: "tag", label: "Tag" },
];

// --- page ------------------------------------------------------------------

export default function KnowledgeGraph() {
  const fgRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [graphData, setGraphData] = useState(null);
  const [filter, setFilter] = useState(null); // null === "all"
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    getKnowledgeGraph()
      .then((data) => {
        if (cancelled) return;
        const nodes = data.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          node_type: n.node_type,
          reference_id: n.reference_id,
          metadata: n.metadata,
          color: NODE_COLORS[n.node_type] ?? "#9ca3af",
        }));
        const links = data.edges.map((e) => ({
          source: e.source_node_id,
          target: e.target_node_id,
          relationship_type: e.relationship_type,
        }));
        setGraphData({ nodes, links });
      })
      .catch(() => !cancelled && setError("Couldn't load the knowledge graph."));
    return () => {
      cancelled = true;
    };
  }, []);

  // Resize observer for the container so the graph fills the available
  // area and tracks page resizes.
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

  // O(1) id → node lookup for connection rendering in the side panel.
  const nodeIndex = useMemo(() => {
    if (!graphData) return {};
    return Object.fromEntries(graphData.nodes.map((n) => [n.id, n]));
  }, [graphData]);

  // Apply the type filter — drop nodes of other types, then drop any edge
  // that no longer has both endpoints visible.
  const filteredGraph = useMemo(() => {
    if (!graphData) return null;
    if (filter === null) return graphData;
    const visibleNodes = graphData.nodes.filter((n) => n.node_type === filter);
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const links = graphData.links.filter((l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return visibleIds.has(s) && visibleIds.has(t);
    });
    return { nodes: visibleNodes, links };
  }, [graphData, filter]);

  const selectedNode = selectedId ? nodeIndex[selectedId] : null;

  // Canvas painter — small dot with a halo for hover/selected, and a
  // label that pops in when active.
  const drawNode = (node, ctx, globalScale) => {
    const isActive = node.id === hoveredId || node.id === selectedId;
    const radius = isActive ? 8 : 5.5;

    if (isActive) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 5, 0, 2 * Math.PI);
      // ~25% alpha halo built from the node's hex.
      ctx.fillStyle = `${node.color}40`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = node.color;
    ctx.fill();
    // Thin stroke so adjacent nodes don't visually merge.
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = "#0a0a0a";
    ctx.stroke();

    if (isActive) {
      const label = node.label || "(no label)";
      const fontSize = Math.max(10, 12 / globalScale);
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      // Drop shadow for legibility against busy backgrounds.
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillText(label, node.x + 1, node.y - radius - 5 + 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, node.x, node.y - radius - 5);
    }
  };

  // Bigger hit area than the visible node so clicks land easily.
  const drawNodeHitArea = (node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 11, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <FilterPills
          options={FILTER_TYPES.map((t) => ({
            value: t.key,
            label: t.label,
            count:
              graphData && t.key !== null
                ? graphData.nodes.filter((n) => n.node_type === t.key).length
                : graphData
                ? graphData.nodes.length
                : undefined,
          }))}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter graph by node type"
        />
      </div>

      <div ref={containerRef} className={styles.canvasShell}>
        {graphData === null && error === null && (
          <div className={styles.canvasOverlay}>
            <Skeleton width="60%" height={20} />
            <Skeleton width="80%" height={14} />
            <Skeleton width="70%" height={14} />
          </div>
        )}
        {error && (
          <div className={styles.canvasOverlay}>
            <Card className={styles.errorCard}>{error}</Card>
          </div>
        )}
        {graphData && filteredGraph.nodes.length === 0 && (
          <div className={styles.canvasOverlay}>
            <EmptyState
              icon={Network}
              title={
                filter
                  ? `No ${filter}s in the graph`
                  : "Graph is empty"
              }
              description={
                filter
                  ? "Try a different filter — other entity types may still be present."
                  : "Create projects, tasks, and files to populate the knowledge graph."
              }
            />
          </div>
        )}

        {graphData && filteredGraph.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={filteredGraph}
            width={size.w}
            height={size.h}
            backgroundColor="#0a0a0a"
            // node drawing
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={drawNodeHitArea}
            nodeLabel={(n) => `${n.node_type}: ${n.label || "(no label)"}`}
            // edges
            linkColor={() => "rgba(161, 161, 170, 0.18)"}
            linkWidth={0.8}
            linkLabel={(l) => l.relationship_type}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => "rgba(161, 161, 170, 0.45)"}
            // interaction
            onNodeClick={(n) => setSelectedId(n.id)}
            onNodeHover={(n) => setHoveredId(n ? n.id : null)}
            cooldownTicks={100}
            d3VelocityDecay={0.3}
          />
        )}

        {/* Legend — overlay in the corner so it doesn't steal vertical space. */}
        {graphData && filteredGraph.nodes.length > 0 && (
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
          links={graphData.links}
          nodeIndex={nodeIndex}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// --- side panel ------------------------------------------------------------

function NodeDetailPanel({ node, links, nodeIndex, onClose }) {
  const navigate = useNavigate();

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

  const openInApp = () => {
    if (node.node_type === "project") {
      navigate(`/project/${node.reference_id}`);
    } else if (node.node_type === "task") {
      // Task nodes carry a reference to the task row, but we don't have a
      // task page; deep-link into the task tab of the parent project via
      // the connections (tasks belongs_to project).
      const parent = connections.find(
        (c) => c.relationship === "belongs_to" && c.other?.node_type === "project"
      );
      if (parent?.other) {
        navigate(`/project/${parent.other.reference_id}?tab=tasks`);
      }
    }
  };

  const canOpen =
    node.node_type === "project" ||
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
              <span className={styles.panelSectionCount}>
                {connections.length}
              </span>
            </h3>
            {connections.length === 0 ? (
              <p className={styles.panelEmpty}>This node has no connections.</p>
            ) : (
              <ul className={styles.connList}>
                {connections.map((c, i) => (
                  <li key={i} className={styles.connRow}>
                    <span
                      className={styles.connDot}
                      style={{
                        backgroundColor:
                          NODE_COLORS[c.other?.node_type] ?? "#9ca3af",
                      }}
                      aria-hidden="true"
                    />
                    <Badge variant="neutral" size="sm">
                      {c.relationship.replace(/_/g, " ")}
                    </Badge>
                    <span className={styles.connArrow}>
                      {c.direction === "out" ? "→" : "←"}
                    </span>
                    <span className={styles.connLabel}>
                      {c.other?.label || c.otherId.slice(0, 8)}
                    </span>
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
                leadingIcon={<ExternalLink size={14} />}
                onClick={openInApp}
              >
                Open in app
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
