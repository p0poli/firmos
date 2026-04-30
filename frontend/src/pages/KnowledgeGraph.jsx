import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { getKnowledgeGraph } from "../api";

const NODE_COLORS = {
  project: "#2563eb",
  task: "#22c55e",
  file: "#eab308",
  user: "#a855f7",
  regulation: "#ef4444",
  insight: "#06b6d4",
  tag: "#8a8d96",
};

export default function KnowledgeGraph() {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getKnowledgeGraph()
      .then((data) => {
        const nodes = data.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          node_type: n.node_type,
          reference_id: n.reference_id,
          metadata: n.metadata,
          color: NODE_COLORS[n.node_type] || "#ffffff",
        }));
        const links = data.edges.map((e) => ({
          source: e.source_node_id,
          target: e.target_node_id,
          relationship_type: e.relationship_type,
        }));
        setGraphData({ nodes, links });
      })
      .catch(() => setError("Failed to load knowledge graph"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setSize({ w: Math.max(300, r.width), h: Math.max(300, r.height) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [loading]);

  const nodeIndex = useMemo(() => {
    const m = {};
    graphData.nodes.forEach((n) => {
      m[n.id] = n;
    });
    return m;
  }, [graphData.nodes]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Knowledge Graph</h2>
      <div style={{ display: "flex", gap: "1rem", height: "calc(100vh - 8rem)" }}>
        <div
          ref={containerRef}
          style={{
            flex: 1,
            background: "#0f1115",
            borderRadius: 8,
            border: "1px solid #25272e",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {loading && (
            <div className="muted" style={{ padding: 16 }}>
              Loading graph…
            </div>
          )}
          {error && (
            <div className="login-error" style={{ padding: 16 }}>
              {error}
            </div>
          )}
          {!loading && !error && graphData.nodes.length === 0 && (
            <div className="muted" style={{ padding: 16 }}>
              Graph is empty. Create projects, tasks, and files to populate it.
            </div>
          )}
          {!loading && !error && graphData.nodes.length > 0 && (
            <ForceGraph2D
              graphData={graphData}
              width={size.w}
              height={size.h}
              backgroundColor="#0f1115"
              nodeRelSize={5}
              nodeLabel={(n) => `${n.node_type}: ${n.label || "(no label)"}`}
              nodeColor={(n) => n.color}
              linkColor={() => "rgba(180,180,180,0.25)"}
              linkLabel={(l) => l.relationship_type}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(n) => setSelected(n)}
              cooldownTicks={100}
            />
          )}
        </div>

        <aside
          style={{
            width: 320,
            background: "#16181d",
            border: "1px solid #25272e",
            borderRadius: 8,
            padding: "1rem",
            overflowY: "auto",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Legend</h3>
          {Object.entries(NODE_COLORS).map(([t, c]) => (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.85rem",
                marginTop: 4,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: c,
                  display: "inline-block",
                }}
              />
              {t}
            </div>
          ))}

          <h3 style={{ marginTop: 24 }}>Details</h3>
          {selected ? (
            <NodeDetails
              node={selected}
              links={graphData.links}
              nodeIndex={nodeIndex}
            />
          ) : (
            <p className="muted">Click a node to see its details and connections.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeDetails({ node, links, nodeIndex }) {
  const connections = links.filter((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return s === node.id || t === node.id;
  });

  return (
    <div>
      <div className="muted" style={{ fontSize: "0.8rem" }}>{node.node_type}</div>
      <h4 style={{ marginTop: 4, marginBottom: 4 }}>
        {node.label || "(no label)"}
      </h4>
      <div
        className="muted"
        style={{ fontSize: "0.75rem", wordBreak: "break-all" }}
      >
        ref: {node.reference_id}
      </div>

      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <pre
          style={{
            background: "#0f1115",
            padding: 8,
            borderRadius: 6,
            marginTop: 12,
            fontSize: "0.75rem",
            overflowX: "auto",
          }}
        >
          {JSON.stringify(node.metadata, null, 2)}
        </pre>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>Connections ({connections.length})</strong>
        {connections.length === 0 && (
          <p className="muted" style={{ marginTop: 4, fontSize: "0.85rem" }}>
            No connections.
          </p>
        )}
        {connections.map((l, i) => {
          const s = typeof l.source === "object" ? l.source.id : l.source;
          const t = typeof l.target === "object" ? l.target.id : l.target;
          const dir = s === node.id ? "→" : "←";
          const otherId = s === node.id ? t : s;
          const other = nodeIndex[otherId];
          return (
            <div key={i} style={{ marginTop: 6, fontSize: "0.85rem" }}>
              <span className="muted">{l.relationship_type}</span> {dir}{" "}
              {other
                ? `${other.node_type}: ${other.label || "(no label)"}`
                : otherId}
            </div>
          );
        })}
      </div>
    </div>
  );
}
