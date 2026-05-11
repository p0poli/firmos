/**
 * KnowledgeWeb — Obsidian-style full-area knowledge graph.
 *
 * Graph IS the page — no left panel. Floating search top-left,
 * floating zoom controls bottom-right, detail panel slides in from right
 * on node click. Dark navy background, organic force-directed layout.
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
import { Link, Maximize2, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createKnowledgeEdge,
  createKnowledgeNode,
  deleteKnowledgeNode,
  updateKnowledgeNode,
} from "../api";
import { useKnowledgeGraph } from "../contexts/KnowledgeGraphContext";
import { usePageTitle } from "../hooks/usePageTitle";
import styles from "./KnowledgeWeb.module.css";

// Node types that get the green accent color (regulation, insight)
const ACCENT_TYPES = new Set(["regulation", "insight", "insight_topic"]);

function getNodeColor(node, selectedId, hoveredId, selConnected) {
  if (node.id === selectedId) return "#ffffff";
  if (node.id === hoveredId)  return "#ffffff";
  if (selectedId && selConnected.has(node.id)) return "#22c55e";
  if (ACCENT_TYPES.has(node.node_type)) return "#22c55e";
  const w = node.weight || 0;
  if (w > 15) return "#9ca3af";
  if (w > 5)  return "#6b7280";
  return "#4a4f6a";
}

function getNodeR(node, selectedId, hoveredId) {
  if (node.id === selectedId) return 10;
  if (node.id === hoveredId)  return 8;
  if (ACCENT_TYPES.has(node.node_type)) return 7;
  const w = node.weight || 0;
  if (w > 15) return 10;
  if (w > 5)  return 6;
  return 4;
}

export default function KnowledgeWeb() {
  usePageTitle("Knowledge Web");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fgRef       = useRef(null);
  const shellRef    = useRef(null);

  const {
    rawNodes,
    graphData,
    isLoading,
    focusNodeId,
    setFocusNodeId,
    refreshGraph,
  } = useKnowledgeGraph();

  const [search, setSearch]             = useState("");
  const [debouncedQ, setDebouncedQ]     = useState("");
  const [hoveredId, setHoveredId]       = useState(null);
  const [selectedId, setSelectedId]     = useState(null);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [editMode, setEditMode]         = useState(false);
  const [editLabel, setEditLabel]       = useState("");
  const [editDesc, setEditDesc]         = useState("");
  const [contextMenu, setContextMenu]   = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [size, setSize] = useState({ w: 900, h: 700 });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Measure graph shell
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(300, width), h: Math.max(300, height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.max(300, r.width), h: Math.max(300, r.height) });
    return () => ro.disconnect();
  }, []);

  // URL ?focus= param — picked up by context effect below
  const urlFocus = searchParams.get("focus");
  useEffect(() => {
    if (urlFocus) setFocusNodeId(urlFocus);
  }, [urlFocus, setFocusNodeId]);

  // When focusNodeId changes (URL or sidebar click) — zoom there
  useEffect(() => {
    if (!focusNodeId || !fgRef.current || graphData.nodes.length === 0) return;
    const node = graphData.nodes.find((n) => n.id === focusNodeId);
    if (!node) return;
    setSelectedId(focusNodeId);
    setPanelOpen(true);
    setTimeout(() => {
      fgRef.current?.centerAt(node.x ?? 0, node.y ?? 0, 800);
      fgRef.current?.zoom(4, 800);
    }, 350);
  }, [focusNodeId, graphData.nodes]);

  // Apply Obsidian-like d3 forces once the graph mounts
  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    const timer = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      fg.d3Force("charge")?.strength(-80);
      fg.d3Force("link")?.distance(40);
      fg.d3Force("center")?.strength(0.1);
    }, 120);
    return () => clearTimeout(timer);
  }, [graphData.nodes.length]);

  // Node lookup
  const nodeMap = useMemo(
    () => Object.fromEntries(graphData.nodes.map((n) => [n.id, n])),
    [graphData.nodes]
  );

  const selectedNode = selectedId ? nodeMap[selectedId] : null;

  // Connected IDs for the selected node (green highlight)
  const selConnected = useMemo(() => {
    if (!selectedId) return new Set();
    const s = new Set();
    for (const l of graphData.links) {
      const src = typeof l.source === "object" ? l.source.id : l.source;
      const tgt = typeof l.target === "object" ? l.target.id : l.target;
      if (src === selectedId) s.add(tgt);
      if (tgt === selectedId) s.add(src);
    }
    return s;
  }, [selectedId, graphData.links]);

  // Connected IDs for the hovered node (dim others)
  const hovConnected = useMemo(() => {
    if (!hoveredId) return null;
    const s = new Set([hoveredId]);
    for (const l of graphData.links) {
      const src = typeof l.source === "object" ? l.source.id : l.source;
      const tgt = typeof l.target === "object" ? l.target.id : l.target;
      if (src === hoveredId) s.add(tgt);
      if (tgt === hoveredId) s.add(src);
    }
    return s;
  }, [hoveredId, graphData.links]);

  // Search match set
  const matchIds = useMemo(() => {
    if (!debouncedQ) return null;
    const q = debouncedQ.toLowerCase();
    return new Set(
      graphData.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id)
    );
  }, [debouncedQ, graphData.nodes]);

  // ── Canvas draw ──────────────────────────────────────────────────────────
  const drawNode = useCallback(
    (node, ctx, globalScale) => {
      const isSelected    = node.id === selectedId;
      const isHovered     = node.id === hoveredId;
      const isSelConn     = selectedId && selConnected.has(node.id);
      const inHovCluster  = hovConnected ? hovConnected.has(node.id) : true;
      const searchMatch   = !matchIds || matchIds.has(node.id);

      const r     = getNodeR(node, selectedId, hoveredId);
      const color = getNodeColor(node, selectedId, hoveredId, selConnected);

      // Dim non-matching nodes
      let alpha = 1;
      if (matchIds && !searchMatch)             alpha = 0.04;
      else if (hovConnected && !inHovCluster)   alpha = 0.12;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Glow halo for selected / selected-neighbor / hovered
      if (isSelected || isHovered || isSelConn) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
        ctx.fillStyle =
          isSelected || isHovered
            ? "rgba(255,255,255,0.05)"
            : "rgba(34,197,94,0.07)";
        ctx.fill();
      }

      // Main dot
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // Label — only on hover, selected, or zoom > 2
      if (isSelected || isHovered || (globalScale > 2 && searchMatch)) {
        const label    = node.label || "";
        const fontSize = Math.max(8, 10 / globalScale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        // Drop shadow
        ctx.fillStyle = "rgba(0,0,0,0.95)";
        ctx.fillText(label, node.x + 0.5, node.y - r - 3 + 0.5);
        ctx.fillStyle = isSelected
          ? "#ffffff"
          : isHovered
          ? "#e5e7eb"
          : "#9ca3af";
        ctx.fillText(label, node.x, node.y - r - 3);
      }

      ctx.restore();
    },
    [selectedId, hoveredId, selConnected, hovConnected, matchIds]
  );

  const paintHitArea = useCallback(
    (node, color, ctx) => {
      const r = Math.max(getNodeR(node, selectedId, hoveredId) + 4, 8);
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    [selectedId, hoveredId]
  );

  // ── Link color / width ───────────────────────────────────────────────────
  const linkColor = useCallback(
    (link) => {
      const s = typeof link.source === "object" ? link.source.id : link.source;
      const t = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedId && (s === selectedId || t === selectedId)) return "#6b7280";
      if (hoveredId  && (s === hoveredId  || t === hoveredId))  return "#4a5568";
      return "#2d3148";
    },
    [selectedId, hoveredId]
  );

  const linkWidth = useCallback(
    (link) => {
      const s = typeof link.source === "object" ? link.source.id : link.source;
      const t = typeof link.target === "object" ? link.target.id : link.target;
      if (selectedId && (s === selectedId || t === selectedId)) return 1.5;
      if (hoveredId  && (s === hoveredId  || t === hoveredId))  return 1.2;
      return 0.8;
    },
    [selectedId, hoveredId]
  );

  // ── Interaction ──────────────────────────────────────────────────────────
  const handleNodeClick = useCallback(
    (node, evt) => {
      evt.stopPropagation();
      if (node.id === selectedId) {
        setSelectedId(null);
        setPanelOpen(false);
      } else {
        setSelectedId(node.id);
        setPanelOpen(true);
        setEditMode(false);
      }
      setFocusNodeId(null);
    },
    [selectedId, setFocusNodeId]
  );

  const handleNodeDbl = useCallback((node) => {
    fgRef.current?.centerAt(node.x, node.y, 500);
    fgRef.current?.zoom(6, 500);
  }, []);

  const handleBgClick = useCallback(() => {
    setSelectedId(null);
    setPanelOpen(false);
    setContextMenu(null);
  }, []);

  // ── CRUD ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedNode) return;
    try {
      await deleteKnowledgeNode(selectedNode.id);
      setSelectedId(null);
      setPanelOpen(false);
      await refreshGraph();
    } catch {/* ignore */}
  };

  const handleSave = async () => {
    if (!selectedNode) return;
    try {
      await updateKnowledgeNode(selectedNode.id, {
        label: editLabel,
        description: editDesc,
      });
      setEditMode(false);
      await refreshGraph();
    } catch {/* ignore */}
  };

  // ── Zoom helpers ─────────────────────────────────────────────────────────
  const zoomIn  = (e) => { e.stopPropagation(); const fg = fgRef.current; if (fg) fg.zoom(fg.zoom() * 1.4, 250); };
  const zoomOut = (e) => { e.stopPropagation(); const fg = fgRef.current; if (fg) fg.zoom(fg.zoom() / 1.4, 250); };
  const fitAll  = (e) => { e.stopPropagation(); fgRef.current?.zoomToFit(400, 40); };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page} onClick={handleBgClick}>
      {/* Graph fills entire page */}
      <div
        ref={shellRef}
        className={styles.graphShell}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY });
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isLoading && graphData.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef}
            graphData={graphData}
            width={size.w}
            height={size.h}
            backgroundColor="#1a1b26"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={paintHitArea}
            nodeLabel={() => ""}
            linkColor={linkColor}
            linkWidth={linkWidth}
            onNodeClick={handleNodeClick}
            onNodeDblClick={handleNodeDbl}
            onNodeHover={(node) => {
              setHoveredId(node ? node.id : null);
              document.body.style.cursor = node ? "pointer" : "default";
            }}
            onBackgroundClick={handleBgClick}
            cooldownTicks={150}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.35}
          />
        )}

        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Loading graph…</p>
          </div>
        )}

        {!isLoading && graphData.nodes.length === 0 && (
          <div className={styles.emptyOverlay}>
            <p className={styles.emptyTitle}>No knowledge nodes</p>
            <p className={styles.emptyHint}>
              Right-click anywhere to add the first node
            </p>
          </div>
        )}

        {/* Context menu */}
        {contextMenu && (
          <div
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.contextItem}
              onClick={() => {
                setShowAddModal(true);
                setContextMenu(null);
              }}
            >
              <Plus size={13} />
              Add knowledge node
            </button>
          </div>
        )}
      </div>

      {/* ── Floating search — top left ─────────────────────────────────── */}
      <div
        className={styles.searchFloat}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search knowledge nodes"
        />
        {debouncedQ && matchIds !== null && (
          <span className={styles.searchCount}>{matchIds.size}</span>
        )}
      </div>

      {/* ── Floating zoom controls — bottom right ──────────────────────── */}
      <div
        className={styles.zoomControls}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.zoomBtn} onClick={zoomIn}  title="Zoom in">
          <Plus size={13} />
        </button>
        <button className={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
          <Minus size={13} />
        </button>
        <button className={styles.zoomBtn} onClick={fitAll}  title="Fit to screen">
          <Maximize2 size={12} />
        </button>
      </div>

      {/* ── Right detail panel ──────────────────────────────────────────── */}
      <aside
        className={`${styles.rightPanel} ${panelOpen ? styles.rightPanelOpen : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {selectedNode && (
          <div className={styles.panelInner}>
            {/* Header */}
            <div className={styles.panelHeader}>
              <span
                className={styles.typeBadge}
                style={
                  ACCENT_TYPES.has(selectedNode.node_type)
                    ? { background: "rgba(34,197,94,0.12)", color: "#22c55e" }
                    : { background: "rgba(74,79,106,0.25)", color: "#9ca3af" }
                }
              >
                {selectedNode.node_type.replace(/_/g, " ")}
              </span>
              <button
                className={styles.panelClose}
                onClick={() => {
                  setSelectedId(null);
                  setPanelOpen(false);
                }}
                aria-label="Close panel"
              >
                <X size={15} />
              </button>
            </div>

            {editMode ? (
              /* ── Edit form ── */
              <div className={styles.editForm}>
                <input
                  className={styles.editInput}
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="Label"
                  autoFocus
                />
                <textarea
                  className={styles.editTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={4}
                />
                <div className={styles.editActions}>
                  <button
                    className={styles.btnPrimary}
                    onClick={handleSave}
                  >
                    Save
                  </button>
                  <button
                    className={styles.btnGhost}
                    onClick={() => setEditMode(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className={styles.panelTitle}>{selectedNode.label}</h2>

                {selectedNode.description && (
                  <p className={styles.panelDesc}>{selectedNode.description}</p>
                )}

                {/* Connections */}
                {(() => {
                  const conns = graphData.links.filter((l) => {
                    const s = typeof l.source === "object" ? l.source.id : l.source;
                    const t = typeof l.target === "object" ? l.target.id : l.target;
                    return s === selectedId || t === selectedId;
                  });
                  if (conns.length === 0) return null;
                  return (
                    <div className={styles.connections}>
                      <p className={styles.connHeading}>
                        Connections ({conns.length})
                      </p>
                      <div className={styles.connChips}>
                        {conns.slice(0, 24).map((l, i) => {
                          const s = typeof l.source === "object" ? l.source.id : l.source;
                          const t = typeof l.target === "object" ? l.target.id : l.target;
                          const otherId = s === selectedId ? t : s;
                          const other = nodeMap[otherId];
                          if (!other) return null;
                          return (
                            <button
                              key={i}
                              className={styles.connChip}
                              onClick={() => {
                                setSelectedId(otherId);
                                const n = graphData.nodes.find(
                                  (x) => x.id === otherId
                                );
                                if (n?.x != null && fgRef.current) {
                                  fgRef.current.centerAt(n.x, n.y, 500);
                                }
                              }}
                            >
                              <span
                                className={styles.connDot}
                                style={{
                                  backgroundColor: ACCENT_TYPES.has(
                                    other.node_type
                                  )
                                    ? "#22c55e"
                                    : "#4a4f6a",
                                }}
                              />
                              {other.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className={styles.panelDivider} />

                {/* Actions */}
                <div className={styles.panelActions}>
                  <button
                    className={styles.btnGhost}
                    onClick={() => {
                      setEditLabel(selectedNode.label || "");
                      setEditDesc(selectedNode.description || "");
                      setEditMode(true);
                    }}
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  <button
                    className={styles.btnGhost}
                    onClick={() => setShowAddModal(true)}
                  >
                    <Link size={12} />
                    Add connection
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={handleDelete}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </aside>

      {/* ── Add node modal ──────────────────────────────────────────────── */}
      {showAddModal && (
        <AddNodeModal
          existingNodes={rawNodes}
          onClose={() => setShowAddModal(false)}
          onCreated={async () => {
            setShowAddModal(false);
            await refreshGraph();
          }}
        />
      )}
    </div>
  );
}

// ── AddNodeModal ─────────────────────────────────────────────────────────────

function AddNodeModal({ existingNodes, onClose, onCreated }) {
  const [label, setLabel]               = useState("");
  const [type, setType]                 = useState("tag");
  const [desc, setDesc]                 = useState("");
  const [connectSearch, setConnSearch]  = useState("");
  const [connectTo, setConnectTo]       = useState([]);
  const [saving, setSaving]             = useState(false);

  const matchingNodes = connectSearch
    ? existingNodes
        .filter((n) =>
          n.label.toLowerCase().includes(connectSearch.toLowerCase())
        )
        .slice(0, 10)
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      const node = await createKnowledgeNode({
        label: label.trim(),
        node_type: type,
        description: desc.trim() || undefined,
      });
      for (const targetId of connectTo) {
        await createKnowledgeEdge({
          source_node_id: node.id,
          target_node_id: targetId,
          relationship_type: "related",
        }).catch(() => {});
      }
      await onCreated();
    } catch {/* ignore */} finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalScrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add knowledge node</h2>
          <button
            className={styles.panelClose}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <form className={styles.modalForm} onSubmit={handleSubmit}>
          <label className={styles.formLabel}>
            Label <span className={styles.req}>*</span>
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
            Connect to
            <input
              className={styles.formInput}
              value={connectSearch}
              onChange={(e) => setConnSearch(e.target.value)}
              placeholder="Search existing nodes…"
            />
          </label>

          {matchingNodes.length > 0 && (
            <div className={styles.connectList}>
              {matchingNodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.connectItem} ${
                    connectTo.includes(n.id) ? styles.connectItemSel : ""
                  }`}
                  onClick={() =>
                    setConnectTo((prev) =>
                      prev.includes(n.id)
                        ? prev.filter((id) => id !== n.id)
                        : [...prev, n.id]
                    )
                  }
                >
                  <span
                    className={styles.connDot}
                    style={{
                      backgroundColor: ACCENT_TYPES.has(n.node_type)
                        ? "#22c55e"
                        : "#4a4f6a",
                    }}
                  />
                  {n.label}
                </button>
              ))}
            </div>
          )}

          {connectTo.length > 0 && (
            <p className={styles.connectHint}>
              Will connect to {connectTo.length} node
              {connectTo.length > 1 ? "s" : ""}
            </p>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={saving || !label.trim()}
            >
              {saving ? "Creating…" : "Create node"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
