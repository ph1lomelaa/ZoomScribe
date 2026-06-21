import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { manager, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Загрузка…</div>;
  if (!manager) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
