import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PrivateRoute from "./components/PrivateRoute";
import { ChatProvider } from "./contexts/ChatContext";
import { PageTitleProvider } from "./contexts/PageTitleContext";
import { UserProvider } from "./contexts/UserContext";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import Gantt from "./pages/Gantt";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import Login from "./pages/Login";
import Management from "./pages/Management/Management";
import Portfolio from "./pages/Portfolio";
import RevitChat from "./pages/RevitChat/RevitChat";
import ProjectDetail from "./pages/ProjectDetail";
import Settings from "./pages/Settings";
import Styleguide from "./pages/Styleguide";
import Tasks from "./pages/Tasks";

export default function App() {
  return (
    <UserProvider>
    <PageTitleProvider>
      <HashRouter>
        {/* ChatProvider must live inside HashRouter so useMatch() resolves
            against the current hash path for project-scoped chat. */}
        <ChatProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Standalone chat page for the Revit WebView2 dockable panel.
                No layout — auth handled via localStorage token injected by C#. */}
            <Route path="/revit-chat" element={<RevitChat />} />
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
              <Route path="management" element={<Management />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ChatProvider>
      </HashRouter>
    </PageTitleProvider>
    </UserProvider>
  );
}
