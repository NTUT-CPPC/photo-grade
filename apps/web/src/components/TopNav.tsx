export function TopNav() {
  const path = window.location.pathname;
  return (
    <nav className="top-nav" aria-label="Application routes">
      <a className={path.startsWith("/admin") ? "active" : ""} href="/admin">Admin</a>
      <a className={path.startsWith("/host") ? "active" : ""} href="/host">Host</a>
      <a className={path.startsWith("/score") ? "active" : ""} href="/score">Score</a>
      <a className={path === "/" || path.startsWith("/view") ? "active" : ""} href="/view">View</a>
    </nav>
  );
}
