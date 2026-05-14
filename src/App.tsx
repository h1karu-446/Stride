import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Tasks from "@/pages/Tasks";
import Review from "@/pages/Review";
import Calendar from "@/pages/Calendar";
import Trends from "@/pages/Trends";
import Archive from "@/pages/Archive";
import Settings from "@/pages/Settings";
import { todayISO } from "@/lib/date";
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
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/review" element={<Navigate to={`/review/${todayISO()}`} replace />} />
        <Route path="/review/:date" element={<Review />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
