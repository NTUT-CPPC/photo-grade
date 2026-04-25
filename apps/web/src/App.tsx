import { Navigate, Route, Routes } from "react-router-dom";
import { TopNav } from "./components/TopNav";
import { AdminPage } from "./pages/AdminPage";
import { HostPage } from "./pages/HostPage";
import { ScorePage } from "./pages/ScorePage";
import { ViewPage } from "./pages/ViewPage";

export function App() {
  return (
    <>
      <TopNav />
      <Routes>
        <Route path="/" element={<Navigate to="/view" replace />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/host" element={<HostPage />} />
        <Route path="/score" element={<ScorePage />} />
        <Route path="/view" element={<ViewPage />} />
      </Routes>
    </>
  );
}
