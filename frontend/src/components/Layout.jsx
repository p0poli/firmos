import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout } from "../api";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/tasks", label: "Tasks" },
  { to: "/files", label: "Files" },
  { to: "/knowledge", label: "Knowledge Graph" },
];

export default function Layout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>FirmOS</h1>
        {links.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end}>
            {label}
          </NavLink>
        ))}
        <div style={{ marginTop: "auto" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "transparent",
              border: "1px solid #25272e",
              borderRadius: 6,
              color: "#c5c8d0",
            }}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
