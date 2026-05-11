/**
 * SidebarMiniGraph — live interactive knowledge graph in the sidebar.
 *
 * Exactly like Obsidian's docked graph view: the full graph at small scale,
 * fully interactable. Hover to see node labels, click to navigate to
 * /knowledge-web?focus={id}. Shares data with the main Knowledge Web page
 * via KnowledgeGraphContext (one fetch, two views).
 *
 * Shows top-100 most-connected nodes so the sidebar never gets cluttered.
 * Settles quickly via d3AlphaDecay=0.05.
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
import { useKnowledgeGraph } from "../../contexts/KnowledgeGraphContext";
import styles from "./SidebarMiniGraph.module.css";

const MAX_NODES = 100;
const GRAPH_W   = 192;
const GRAPH_H   = 200;

// Same palette as the main graph — high contrast against #1a1b26
const TYPE_COLORS = {
  regulation:    "#22c55e",
  insight:       "#22c55e",
  insight_topic: "#22c55e",
  tag:           "#818cf8",
  location:      "#34d399",
  building_type: "#fbbf24",
  technique:     "#60a5fa",
  knowledge:     "#c084fc",
};

function miniColor(node) {
  if (TYPE_COLORS[node.node_type]) return TYPE_COLORS[node.node_type];
  const w = node.weight || 0;
  if (w > 10) return "#ffffff";
  if (w > 3)  return "#a5b4fc";
  return "#6366f1";
}

export default function SidebarMiniGraph() {
  const navigate = useNavigate();
  const { graphData, stats, isLoading, setFocusNodeId } = useKnowledgeGraph();
  const fgRef         = useRef(null);
  const [hovered, setHovered] = useState(null);

  // Top-100 most-connected nodes
  const miniData = useMemo(() => {
    if (!graphData.nodes.length) return { nodes: [], links: [] };
    const sorted = [...graphData.nodes].sort(
      (a, b) => (b.weight || 0) - (a.weight || 0)
    );
    const top    = sorted.slice(0, MAX_NODES);
    const topIds = new Set(top.map((n) => n.id));
    const links  = graphData.links.filter((l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return topIds.has(s) && topIds.has(t);
    });
    return { nodes: top, links };
  }, [graphData]);

  // Very tight forces for the small 192×200 viewport
  useEffect(() => {
    if (miniData.nodes.length === 0) return;
    const timer = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      fg.d3Force("charge")?.strength(-15);   // very low repulsion → dense cluster
      fg.d3Force("link")?.distance(15);       // short links → compact
      fg.d3Force("center")?.strength(0.5);    // strong center pull
      try { fg.d3Force("collision")?.radius(5); } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [miniData.nodes.length]);

  const drawNode = useCallback(
    (node, ctx) => {
      const isHov = hovered?.id === node.id;
      const r     = isHov ? 4 : 2.5;
      const color = isHov ? "#ffffff" : miniColor(node);

      ctx.save();

      // Subtle glow — same bloom as main graph, toned down for small size
      if (isHov) {
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur  = 6;
      } else {
        ctx.shadowColor = color;
        ctx.shadowBlur  = 4;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.restore();
    },
    [hovered]
  );

  const paintHit = useCallback((_node, color, ctx) => {
    ctx.beginPath();
    ctx.arc(_node.x, _node.y, 8, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  const handleClick = useCallback(
    (node) => {
      setFocusNodeId(node.id);
      navigate(`/knowledge-web?focus=${node.id}`);
    },
    [navigate, setFocusNodeId]
  );

  const handleHover = useCallback((node) => {
    setHovered(node || null);
  }, []);

  // Stats line
  const todayCount  = stats?.activity_last_7_days?.slice(-1)[0]?.nodes_added ?? 0;
  const totalNodes  = stats?.total_nodes ?? graphData.nodes.length;

  const hasData = !isLoading && miniData.nodes.length > 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.graphBox}>
        {hasData && (
          <ForceGraph2D
            ref={fgRef}
            graphData={miniData}
            width={GRAPH_W}
            height={GRAPH_H}
            backgroundColor="#1a1b26"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={paintHit}
            nodeLabel={() => ""}
            linkColor={() => "#3d4270"}
            linkWidth={0.4}
            onNodeClick={handleClick}
            onNodeHover={handleHover}
            enableZoomInteraction
            enablePanInteraction
            cooldownTicks={100}
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.4}
          />
        )}

        {isLoading && (
          <div className={styles.placeholder} aria-hidden="true" />
        )}

        {/* Hover tooltip */}
        {hovered && (
          <div className={styles.tooltip}>{hovered.label}</div>
        )}
      </div>

      {/* Stats line — click to open full graph */}
      <button
        className={styles.statsLine}
        onClick={() => navigate("/knowledge-web")}
        title="Open Knowledge Web"
      >
        {totalNodes} nodes
        {todayCount > 0 ? ` · +${todayCount} today` : ""}
      </button>
    </div>
  );
}
