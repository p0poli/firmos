import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PrivateRoute from "./components/PrivateRoute";
import { PageTitleProvider } from "./contexts/PageTitleContext";
import { UserProvider } from "./contexts/UserContext";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import Gantt from "./pages/Gantt";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import Login from "./pages/Login";
import Portfolio from "./pages/Portfolio";
import ProjectDetail from "./pages/ProjectDetail";
import Settings from "./pages/Settings";
import Styleguide from "./pages/Styleguide";
import Tasks from "./pages/Tasks";

export default function App() {
  return (
    <UserProvider>
    <PageTitleProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public, unauth — visual sanity check for design-system
              primitives. Mounted at /#/_styleguide; kept around as a
              live reference for the design system. */}
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
            <Route path="gantt" element={<Gantt />} />
            <Route path="files" element={<Files />} />
            <Route path="knowledge" element={<KnowledgeGraph />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </PageTitleProvider>
    </UserProvider>
  );
}
