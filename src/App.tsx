import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import Today from "@/pages/Today";
import Journey from "@/pages/Journey";
import AchievementReel from "@/pages/AchievementReel";
import Plans from "@/pages/Plans";
import PlanDetail from "@/pages/PlanDetail";
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
      <Route path="/journey/achievements" element={<AchievementReel />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Today />} />
        <Route path="/day/:date" element={<Today />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/plans/:id" element={<PlanDetail />} />
        <Route path="/journey" element={<Journey />} />
        <Route path="/calendar" element={<Navigate to="/journey" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
