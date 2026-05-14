import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import Today from "@/pages/Today";
import Calendar from "@/pages/Calendar";
import Settings from "@/pages/Settings";
import { useStore } from "@/lib/store";

export default function App() {
  const tasks = useStore((s) => s.tasks);
  const reviews = useStore((s) => s.reviews);
  const loadSeed = useStore((s) => s.loadSeed);

  useEffect(() => {
    if (tasks.length === 0 && reviews.length === 0) {
      loadSeed();
    }
  }, [tasks.length, reviews.length, loadSeed]);

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
