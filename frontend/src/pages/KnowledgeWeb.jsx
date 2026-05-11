/**
 * KnowledgeWeb — firm-wide concept graph.
 *
 * Shows only "knowledge" nodes (tags, regulations, techniques, locations, etc.)
 * with glow effects. Left panel for search/filter/details; right panel for graph.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ForceGraph2D from "react-force-graph-2d";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Brain, Plus, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from "../components/ui";
import {
  createKnowledgeEdge,
  createKnowledgeNode,
  deleteKnowledgeNode,
  getKnowledgeWeb,
  searchKnowledge,
  updateKnowledgeNode,
} from "../api";
import { usePageTitle } from "../hooks/usePageTitle";
import styles from "./KnowledgeWeb.module.css";

const NODE_COLORS = {
  regulation:    "#ef4444",
  technique:     "#3b82f6",
  tag:           "#71717a",
  building_type: "#f59e0b",
  location:      "#22c55e",
  knowledge:     "#8b5cf6",
  insight_topic: "#06b6d4",
};

const ALL_TYPES = Object.keys(NODE_COLORS);

function nodeRadius(weight) {
  if (weight <= 3)  return 4;
  if (weight <= 10) return 8;
  if (weight <= 30) return 14;
  return 20;
}

export default function KnowledgeWeb() {
  usePageTitle("Knowledge Web");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fgRef = useRef(null);
  const containerRef = useRef(null);

  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(new Set(ALL_TYPES));
  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [contextMenu, setContextMenu] = useState(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Load graph
  useEffect(() => {
    setLoading(true);
    getKnowledgeWeb()
      .then((data) => {
        setRawData(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Couldn't load the knowledge web.");
        setLoading(false);
      });
  }, []);

  // Focus node from URL param after load
  const focusNodeId = searchParams.get("focus");
  useEffect(() => {
    if (!focusNodeId || !rawData || !fgRef.current) return;
    const node = rawData.nodes.find((n) => n.id === focusNodeId);
    if (node) {
      setSelectedId(focusNodeId);
      setTimeout(() => {
        if (fgRef.current) {
          fgRef.current.centerAt(node.x ?? 0, node.y ?? 0, 1000);
          fgRef.current.zoom(3, 1000);
        }
      }, 600);
    }
  }, [focusNodeId, rawData]);

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
  }, [rawData]);

  const nodeIndex = useMemo(() => {
    if (!rawData) return {};
    return Object.fromEntries(rawData.nodes.map((n) => [n.id, n]));
  }, [rawData]);

  // Compute node opacities based on search + hover
  const filteredGraph = useMemo(() => {
    if (!rawData) return null;
    const q = debouncedSearch.trim().toLowerCase();

    const visibleNodes = rawData.nodes
      .filter((n) => typeFilter.has(n.node_type))
      .map((n) => {
        const match = !q || n.label.toLowerCase().includes(q);
        return {
          id: n.id,
          label: n.label,
          node_type: n.node_type,
          reference_id: n.reference_id,
          description: n.description,
          metadata: n.metadata || {},
          weight: n.weight || 0,
          color: NODE_COLORS[n.node_type] ?? "#71717a",
          searchMatch: match,
          last_active: n.last_active,
        };
      });

    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const links = rawData.edges
      .filter((e) => {
        return visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id);
      })
      .map((e) => ({
        source: e.source_node_id,
        target: e.target_node_id,
        relationship_type: e.relationship_type,
      }));

    return { nodes: visibleNodes, links };
  }, [rawData, debouncedSearch, typeFilter]);

  const selectedNode = selectedId ? nodeIndex[selectedId] : null;

  // Connected node IDs for hover highlight
  const hoveredConnected = useMemo(() => {
    if (!hoveredId || !filteredGraph) return new Set();
    const connected = new Set([hoveredId]);
    for (const l of filteredGraph.links) {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === hoveredId) connected.add(t);
      if (t === hoveredId) connected.add(s);
    }
    return connected;
  }, [hoveredId, filteredGraph]);

  const drawNode = useCallback(
    (node, ctx, globalScale) => {
      const r = nodeRadius(node.weight);
      const color = node.color;
      const isSelected = node.id === selectedId;
      const isHovered = node.id === hoveredId;
      const isConnected = hoveredId && hoveredConnected.has(node.id);

      const q = debouncedSearch.trim();
      let opacity = 1;
      if (q && !node.searchMatch) opacity = 0.08;
      else if (hoveredId && !isConnected) opacity = 0.05;

      ctx.globalAlpha = opacity;

      // Glow: larger faint pass first
      ctx.beginPath();
      ctx.arc(node.x, node.y, r * 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = `${color}18`;
      ctx.fill();

      // Main dot
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = `${color}80`;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      ctx.globalAlpha = opacity;
      if (isSelected || isHovered || (globalScale > 1.5 && node.searchMatch)) {
        const label = node.label || "(no label)";
        const fontSize = Math.max(9, 11 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillText(label, node.x + 1, node.y - r - 4 + 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, node.x, node.y - r - 4);
      }

      ctx.globalAlpha = 1;
    },
    [selectedId, hoveredId, hoveredConnected, debouncedSearch]
  );

  const drawNodeHitArea = (node, color, ctx) => {
    const r = nodeRadius(node.weight);
    ctx.beginPath();
    ctx.arc(node.x, node.y, Math.max(r + 4, 10), 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  };

  // Right-click context menu
  const handleBackgroundRightClick = useCallback((evt) => {
    evt.preventDefault();
    setContextMenu({ x: evt.clientX, y: evt.clientY });
  }, []);

  const handleNodeDelete = async () => {
    if (!selectedNode) return;
    try {
      await deleteKnowledgeNode(selectedNode.id);
      setSelectedId(null);
      // Refresh
      const data = await getKnowledgeWeb();
      setRawData(data);
    } catch {
      // ignore
    }
  };

  const handleNodeSave = async () => {
    if (!selectedNode) return;
    try {
      await updateKnowledgeNode(selectedNode.id, {
        label: editLabel,
        description: editDesc,
      });
      setEditMode(false);
      const data = await getKnowledgeWeb();
      setRawData(data);
    } catch {
      // ignore
    }
  };

  // Search results list (API search for long queries)
  const [apiResults, setApiResults] = useState(null);
  useEffect(() => {
    if (!debouncedSearch || debouncedSearch.split(" ").length <= 3) {
      setApiResults(null);
      return;
    }
    searchKnowledge(debouncedSearch)
      .then((res) => setApiResults(res))
      .catch(() => {});
  }, [debouncedSearch]);

  const displayResults = apiResults
    ? apiResults.nodes
    : filteredGraph
    ? filteredGraph.nodes.filter((n) => n.searchMatch && debouncedSearch)
    : [];

  return (
    <div className={styles.page}>
      {/* Left panel */}
      <aside className={styles.leftPanel}>
        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            type="search"
            placeholder="Search knowledge…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search knowledge nodes"
          />
        </div>

        {/* Type filter checkboxes */}
        <div className={styles.typeFilters}>
          <p className={styles.filterLabel}>Node types</p>
          {ALL_TYPES.map((t) => (
            <label key={t} className={styles.typeCheck}>
              <input
                type="checkbox"
                checked={typeFilter.has(t)}
                onChange={() => {
                  setTypeFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  });
                }}
              />
              <span
                className={styles.typeDot}
                style={{ backgroundColor: NODE_COLORS[t] }}
              />
              <span>{t.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>

        <Button
          variant="primary"
          size="sm"
          leadingIcon={<Plus size={14} />}
          onClick={() => setShowAddModal(true)}
          className={styles.addBtn}
        >
          Add knowledge
        </Button>

        {/* Search results */}
        {debouncedSearch && displayResults.length > 0 && (
          <div className={styles.searchResults}>
            <p className={styles.filterLabel}>Results ({displayResults.length})</p>
            {displayResults.slice(0, 20).map((n) => (
              <button
                key={n.id}
                className={styles.resultItem}
                onClick={() => {
                  setSelectedId(n.id);
                  const node = rawData?.nodes.find((rn) => rn.id === n.id);
                  if (node && fgRef.current) {
                    fgRef.current.centerAt(node.x ?? 0, node.y ?? 0, 800);
                    fgRef.current.zoom(3, 800);
                  }
                }}
              >
                <span
                  className={styles.typeDot}
                  style={{ backgroundColor: NODE_COLORS[n.node_type] ?? "#71717a" }}
                />
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected node details */}
        {selectedNode && (
          <div className={styles.selectedPanel}>
            <div className={styles.selectedHeader}>
              <span
                className={styles.typeDot}
                style={{ backgroundColor: NODE_COLORS[selectedNode.node_type] ?? "#71717a" }}
              />
              <span className={styles.selectedType}>{selectedNode.node_type}</span>
              <button
                className={styles.closeBtn}
                onClick={() => setSelectedId(null)}
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {editMode ? (
              <div className={styles.editForm}>
                <input
                  className={styles.editInput}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Label"
                />
                <textarea
                  className={styles.editTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Description"
                  rows={3}
                />
                <div className={styles.editActions}>
                  <Button variant="primary" size="sm" onClick={handleNodeSave}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <h3 className={styles.selectedTitle}>{selectedNode.label}</h3>
                {selectedNode.description && (
                  <p className={styles.selectedDesc}>{selectedNode.description}</p>
                )}
                {selectedNode.metadata && Object.keys(selectedNode.metadata).length > 0 && (
                  <dl className={styles.metaList}>
                    {Object.entries(selectedNode.metadata).slice(0, 4).map(([k, v]) => (
                      <div key={k} className={styles.metaRow}>
                        <dt>{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Connections grouped by type */}
                {filteredGraph && (() => {
                  const conns = filteredGraph.links.filter((l) => {
                    const s = typeof l.source === "object" ? l.source.id : l.source;
                    const t = typeof l.target === "object" ? l.target.id : l.target;
                    return s === selectedId || t === selectedId;
                  });
                  const grouped = {};
                  for (const c of conns) {
                    const s = typeof c.source === "object" ? c.source.id : c.source;
                    const t = typeof c.target === "object" ? c.target.id : c.target;
                    const otherId = s === selectedId ? t : s;
                    const other = nodeIndex[otherId];
                    const key = other?.node_type || "other";
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(other?.label || otherId?.slice(0, 8));
                  }
                  return Object.keys(grouped).length > 0 ? (
                    <div className={styles.connGroups}>
                      {Object.entries(grouped).map(([type, labels]) => (
                        <div key={type} className={styles.connGroup}>
                          <span className={styles.connGroupType}>
                            {type.replace(/_/g, " ")} ({labels.length}):{" "}
                          </span>
                          {labels.slice(0, 5).map((l, i) => (
                            <span key={i} className={styles.connChip}>{l}</span>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}

                <div className={styles.nodeActions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditLabel(selectedNode.label || "");
                      setEditDesc(selectedNode.description || "");
                      setEditMode(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    leadingIcon={<Trash2 size={12} />}
                    onClick={handleNodeDelete}
                  >
                    Delete
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </aside>

      {/* Right graph panel */}
      <div
        ref={containerRef}
        className={styles.graphShell}
        onContextMenu={handleBackgroundRightClick}
        onClick={() => contextMenu && setContextMenu(null)}
      >
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
        {!loading && !error && filteredGraph && filteredGraph.nodes.length === 0 && (
          <div className={styles.overlay}>
            <EmptyState
              icon={Brain}
              title="No knowledge nodes"
              description="Add knowledge nodes to populate the web, or enable more node types."
            />
          </div>
        )}
        {!loading && !error && filteredGraph && filteredGraph.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={filteredGraph}
            width={size.w}
            height={size.h}
            backgroundColor="#050505"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={drawNodeHitArea}
            nodeLabel={(n) => `${n.node_type}: ${n.label}`}
            linkColor={() => "#ffffff08"}
            linkWidth={0.5}
            linkDirectionalParticles={1}
            linkDirectionalParticleSpeed={0.003}
            onNodeClick={(n) => setSelectedId(n.id === selectedId ? null : n.id)}
            onNodeHover={(n) => setHoveredId(n ? n.id : null)}
            cooldownTicks={120}
            d3VelocityDecay={0.35}
          />
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.contextMenuItem}
              onClick={() => {
                setShowAddModal(true);
                setContextMenu(null);
              }}
            >
              <Plus size={14} /> Add knowledge node
            </button>
          </div>
        )}
      </div>

      {/* Add node modal */}
      {showAddModal && (
        <AddNodeModal
          existingNodes={rawData?.nodes || []}
          onClose={() => setShowAddModal(false)}
          onCreated={async () => {
            setShowAddModal(false);
            const data = await getKnowledgeWeb();
            setRawData(data);
          }}
        />
      )}
    </div>
  );
}

// --- Add Node Modal ---

function AddNodeModal({ existingNodes, onClose, onCreated }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState("tag");
  const [desc, setDesc] = useState("");
  const [connectSearch, setConnectSearch] = useState("");
  const [connectTo, setConnectTo] = useState([]);
  const [saving, setSaving] = useState(false);

  const matchingNodes = connectSearch
    ? existingNodes.filter((n) =>
        n.label.toLowerCase().includes(connectSearch.toLowerCase())
      ).slice(0, 10)
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await createKnowledgeNode({
        label: label.trim(),
        node_type: type,
        description: desc.trim() || undefined,
        connect_to: connectTo,
      });
      await onCreated();
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
          <h2 className={styles.modalTitle}>Add knowledge node</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.formLabel}>
            Label <span className={styles.required}>*</span>
            <input
              className={styles.formInput}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. IBC Fire Safety"
              required
              autoFocus
            />
          </label>

          <label className={styles.formLabel}>
            Type
            <select
              className={styles.formSelect}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="tag">Tag</option>
              <option value="regulation">Regulation</option>
              <option value="technique">Technique</option>
              <option value="building_type">Building Type</option>
              <option value="location">Location</option>
              <option value="knowledge">Knowledge</option>
            </select>
          </label>

          <label className={styles.formLabel}>
            Description
            <textarea
              className={styles.formTextarea}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </label>

          <label className={styles.formLabel}>
            Connect to (search existing nodes)
            <input
              className={styles.formInput}
              value={connectSearch}
              onChange={(e) => setConnectSearch(e.target.value)}
              placeholder="Search nodes…"
            />
          </label>
          {matchingNodes.length > 0 && (
            <div className={styles.connectList}>
              {matchingNodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.connectItem} ${connectTo.includes(n.id) ? styles.connectItemSelected : ""}`}
                  onClick={() => {
                    setConnectTo((prev) =>
                      prev.includes(n.id) ? prev.filter((id) => id !== n.id) : [...prev, n.id]
                    );
                  }}
                >
                  <span
                    className={styles.typeDot}
                    style={{ backgroundColor: NODE_COLORS[n.node_type] ?? "#71717a" }}
                  />
                  {n.label}
                </button>
              ))}
            </div>
          )}
          {connectTo.length > 0 && (
            <p className={styles.connectCount}>
              Will connect to {connectTo.length} node{connectTo.length > 1 ? "s" : ""}
            </p>
          )}

          <div className={styles.modalActions}>
            <Button variant="ghost" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving || !label.trim()}>
              {saving ? "Creating…" : "Create node"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
