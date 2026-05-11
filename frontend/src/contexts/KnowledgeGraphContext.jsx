/**
 * KnowledgeGraphContext — shared live graph data for the Knowledge Web page
 * and the Sidebar mini-graph. Both instances read from a single fetch,
 * refreshed every 60 seconds.
 *
 * Provides:
 *   graphData      — { nodes, links }  pre-processed for react-force-graph-2d
 *   rawNodes       — original API node objects (for modals, searches)
 *   stats          — { total_nodes, today_count }
 *   isLoading
 *   focusNodeId    — set by sidebar click to tell the page which node to zoom to
 *   setFocusNodeId
 *   refreshGraph() — manually refetch (call after create/delete operations)
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getKnowledgeStats, getKnowledgeWeb } from "../api";

const KnowledgeGraphContext = createContext(null);

/** Convert the /knowledge/web response into ForceGraph2D-compatible format. */
function processGraph(data) {
  if (!data) return { nodes: [], links: [] };
  const nodes = (data.nodes || []).map((n) => ({
    id: n.id,
    label: n.label,
    node_type: n.node_type,
    reference_id: n.reference_id,
    description: n.description,
    metadata: n.metadata || {},
    weight: n.weight || 0,
    last_active: n.last_active,
  }));
  const links = (data.edges || []).map((e) => ({
    source: e.source_node_id,
    target: e.target_node_id,
    relationship_type: e.relationship_type,
  }));
  return { nodes, links };
}

export function KnowledgeGraphProvider({ children }) {
  const [rawNodes, setRawNodes] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const intervalRef = useRef(null);

  const fetchGraph = useCallback(async () => {
    try {
      const data = await getKnowledgeWeb();
      setRawNodes(data?.nodes || []);
      setGraphData(processGraph(data));
    } catch {
      // Silently fail — we're in a sidebar component; can't crash the whole UI
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const s = await getKnowledgeStats();
      setStats(s);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchGraph();
    fetchStats();
    intervalRef.current = setInterval(() => {
      fetchGraph();
      fetchStats();
    }, 60_000);
    return () => clearInterval(intervalRef.current);
  }, [fetchGraph, fetchStats]);

  const refreshGraph = useCallback(async () => {
    await Promise.all([fetchGraph(), fetchStats()]);
  }, [fetchGraph, fetchStats]);

  return (
    <KnowledgeGraphContext.Provider
      value={{
        rawNodes,
        graphData,
        stats,
        isLoading,
        focusNodeId,
        setFocusNodeId,
        refreshGraph,
      }}
    >
      {children}
    </KnowledgeGraphContext.Provider>
  );
}

export function useKnowledgeGraph() {
  const ctx = useContext(KnowledgeGraphContext);
  if (!ctx) {
    throw new Error(
      "useKnowledgeGraph must be used inside <KnowledgeGraphProvider>"
    );
  }
  return ctx;
}
