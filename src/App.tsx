import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import Today from "@/pages/Today";
import Calendar from "@/pages/Calendar";
import Settings from "@/pages/Settings";
import SignIn from "@/pages/SignIn";
import { useAuth } from "@/lib/auth";

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm muted">
        読み込み中…
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<SignIn />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Today />} />
        <Route path="/day/:date" element={<Today />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
