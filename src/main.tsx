import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectPage from "./pages/ProjectPage";
import OrderPage from "./pages/OrderPage";
import DashboardPage from "./pages/DashboardPage";
import OrderTasksPage from "./pages/OrderTasksPage";
import AppLayout from "./components/AppLayout";
import NotFoundPage from "./pages/NotFoundPage";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/:orderId" element={<OrderPage />} />
        <Route path="projects/:projectId/:orderId/tasks" element={<OrderTasksPage />} />
        <Route path="projects/:projectId/:orderId/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  </BrowserRouter>
);