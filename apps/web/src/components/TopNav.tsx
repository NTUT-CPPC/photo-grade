import { NavLink } from "react-router-dom";

export function TopNav() {
  return (
    <nav className="top-nav" aria-label="Application routes">
      <NavLink to="/admin">Admin</NavLink>
      <NavLink to="/host">Host</NavLink>
      <NavLink to="/score">Score</NavLink>
      <NavLink to="/view">View</NavLink>
    </nav>
  );
}
