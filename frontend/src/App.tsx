import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, lazy, type ReactNode } from "react";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { useAuth } from "./lib/auth";
import HomePage from "./pages/Home";

// Route-level code splitting: only the public homepage ships in the main bundle;
// every other page downloads the first time it is visited.
const AnalysesPage = lazy(() => import("./pages/Analyses"));
const AnalysisResultPage = lazy(() => import("./pages/AnalysisResult"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));
const FindCarePage = lazy(() => import("./pages/FindCare"));
const HistoryPage = lazy(() => import("./pages/History"));
const LibraryPage = lazy(() => import("./pages/Library"));
const LoginPage = lazy(() => import("./pages/Auth").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/Auth").then((m) => ({ default: m.RegisterPage })));
const ResetPasswordPage = lazy(() => import("./pages/Auth").then((m) => ({ default: m.ResetPasswordPage })));
const NewAnalysisPage = lazy(() => import("./pages/NewAnalysis"));
const NotFoundPage = lazy(() => import("./pages/NotFound"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const ReportDetailPage = lazy(() => import("./pages/ReportDetail"));
const ReportsPage = lazy(() => import("./pages/Reports"));
const TrendsPage = lazy(() => import("./pages/Trends"));
const StaffPage = lazy(() => import("./pages/Staff"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation() as { pathname: string; state?: { from?: string } };
  if (loading) return <Spinner />;
  if (user) {
    // Newly registered users go to their profile; returning users go back where they were.
    if (location.pathname === "/register") return <Navigate to="/profile" replace state={{ welcome: true }} />;
    return <Navigate to={location.state?.from ?? "/dashboard"} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><Spinner /></div>}>
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="/reset-password" element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:id" element={<ReportDetailPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="care" element={<FindCarePage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="analyses" element={<AnalysesPage />} />
        <Route path="analyses/new" element={<NewAnalysisPage />} />
        <Route path="analyses/:id" element={<AnalysisResultPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
