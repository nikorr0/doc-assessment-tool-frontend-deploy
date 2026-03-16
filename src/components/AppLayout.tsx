import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboardPage = location.pathname.includes("/dashboard");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand" onClick={() => navigate("/projects")}>
          УНИР
        </div>
        <nav className="app-nav">
          <NavLink to="/projects" end>
            Проекты
          </NavLink>
        </nav>
      </header>

      <main className={`app-main${isDashboardPage ? " app-main--wide" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}