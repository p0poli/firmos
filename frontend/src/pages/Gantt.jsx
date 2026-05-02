import React from "react";
import { BarChart3 } from "lucide-react";
import { Card, EmptyState } from "../components/ui";

/**
 * Gantt — firm-wide timeline view (placeholder).
 *
 * The real implementation lands in Step 6 of the UI overhaul (per-project
 * Gantt tab first, then this firm-wide page). For now it's a routed empty
 * state so the sidebar item has somewhere to go without 404-ing.
 */
export default function Gantt() {
  return (
    <Card padding="none">
      <EmptyState
        icon={BarChart3}
        size="lg"
        title="Gantt view is on its way"
        description="Step 6 of the redesign adds a firm-wide timeline of projects and tasks here, plus a per-project Gantt tab inside Project Detail."
      />
    </Card>
  );
}
