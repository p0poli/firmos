/**
 * KnowledgePulse — 7-day activity ring in the sidebar.
 *
 * Fetches /knowledge/stats on mount (cached 5 min via module-level ref).
 * Renders a 140x140 SVG ring with 7 arc segments, one per day.
 * Clicking navigates to /knowledge-web.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getKnowledgeStats } from "../../api";
import styles from "./KnowledgePulse.module.css";

// Module-level cache so the component doesn't refetch on every sidebar render
let _cachedStats = null;
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- SVG arc helpers ---

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const s = polarToCartesian(cx, cy, r, startAngle);
  const e = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

function segmentColor(count) {
  if (count === 0)    return "#1a1a1a";
  if (count <= 2)     return "#5865f230";
  if (count <= 5)     return "#5865f260";
  return "#5865f2";
}

const CX = 70;
const CY = 70;
const R  = 52;
const SEGMENT_SPAN = 360 / 7;
const GAP = 4; // degrees of gap between segments

export default function KnowledgePulse() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(_cachedStats);

  useEffect(() => {
    const now = Date.now();
    if (_cachedStats && now - _cacheTime < CACHE_TTL) {
      setStats(_cachedStats);
      return;
    }
    getKnowledgeStats()
      .then((data) => {
        _cachedStats = data;
        _cacheTime = Date.now();
        setStats(data);
      })
      .catch(() => {
        // Silently fail — sidebar component shouldn't break the layout
      });
  }, []);

  if (!stats) {
    return (
      <div className={styles.container}>
        <div className={styles.ringPlaceholder} />
      </div>
    );
  }

  const days = stats.activity_last_7_days || [];
  const todayCount = days.length > 0 ? days[days.length - 1].nodes_added : 0;

  return (
    <button
      className={styles.container}
      onClick={() => navigate("/knowledge-web")}
      title="Knowledge Web activity"
      aria-label="Open Knowledge Web"
    >
      <svg
        width={140}
        height={140}
        viewBox="0 0 140 140"
        className={styles.ring}
        aria-hidden="true"
      >
        {days.map((day, i) => {
          const startAngle = i * SEGMENT_SPAN + GAP / 2;
          const endAngle = startAngle + SEGMENT_SPAN - GAP;
          return (
            <path
              key={i}
              d={describeArc(CX, CY, R, startAngle, endAngle)}
              fill="none"
              stroke={segmentColor(day.nodes_added)}
              strokeWidth={8}
              strokeLinecap="round"
            />
          );
        })}

        {/* Center dot — pulses if nodes added today */}
        {todayCount > 0 ? (
          <circle
            cx={CX}
            cy={CY}
            r={6}
            fill="#5865f2"
            className={styles.pulseDot}
          />
        ) : (
          <circle cx={CX} cy={CY} r={5} fill="#1e1e1e" />
        )}
      </svg>

      <p className={styles.statsText}>
        {stats.total_nodes} nodes{todayCount > 0 ? ` · +${todayCount} today` : ""}
      </p>
    </button>
  );
}
