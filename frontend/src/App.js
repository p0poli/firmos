import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PrivateRoute from "./components/PrivateRoute";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import Login from "./pages/Login";
import Portfolio from "./pages/Portfolio";
import ProjectDetail from "./pages/ProjectDetail";
import Styleguide from "./pages/Styleguide";
import Tasks from "./pages/Tasks";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Public, unauth — visual sanity check for design-system primitives.
            Mounted at /#/_styleguide while the dark-theme redesign is being
            built; will be removed once the overhaul ships. */}
        <Route path="/_styleguide" element={<Styleguide />} />
        <Route
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
          <Route path="project/:id" element={<ProjectDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="files" element={<Files />} />
          <Route path="knowledge" element={<KnowledgeGraph />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
