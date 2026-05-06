/**
 * Dashboard — role-based selector.
 *
 * Reads the current user's role from UserContext (decoded from the JWT at
 * login time, so no extra round-trip) and renders the matching dashboard:
 *
 *   admin            → AdminDashboard
 *   project_manager  → ProjectManagerDashboard
 *   architect (default) → ArchitectDashboard
 */
import React from "react";
import { useUser } from "../contexts/UserContext";
import AdminDashboard from "./Dashboard/AdminDashboard";
import ArchitectDashboard from "./Dashboard/ArchitectDashboard";
import ProjectManagerDashboard from "./Dashboard/ProjectManagerDashboard";

export default function Dashboard() {
  const { role } = useUser();

  if (role === "admin")            return <AdminDashboard />;
  if (role === "project_manager")  return <ProjectManagerDashboard />;
  return <ArchitectDashboard />;
}
