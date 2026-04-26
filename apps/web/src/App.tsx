import { TopNav } from "./components/TopNav";
import { AdminPage } from "./pages/AdminPage";
import { HostPage } from "./pages/HostPage";
import { ScorePage } from "./pages/ScorePage";
import { ViewPage } from "./pages/ViewPage";

export function App() {
  const path = window.location.pathname;

  return (
    <>
      <div className="app-toolbar">
        <TopNav />
      </div>
      {path.startsWith("/admin") ? <AdminPage /> : null}
      {path.startsWith("/host") ? <HostPage /> : null}
      {path.startsWith("/score") ? <ScorePage /> : null}
      {path === "/" || path.startsWith("/view") ? <ViewPage /> : null}
    </>
  );
}
