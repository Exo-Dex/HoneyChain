import { NavLink } from 'react-router-dom';

export default function TopBar() {
  return (
    <div className="topbar">
      <NavLink to="/" className="brand">
        <span className="emoji">🍯</span> Honey Chain
      </NavLink>
      <div className="nav-links">
        <NavLink to="/beekeeper" className={({ isActive }) => (isActive ? 'active' : '')}>
          Beekeeper
        </NavLink>
        <NavLink to="/cluster" className={({ isActive }) => (isActive ? 'active' : '')}>
          Cluster Alerts
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
          Processing / Lab
        </NavLink>
        <NavLink to="/ledger" className={({ isActive }) => (isActive ? 'active' : '')}>
          Ledger
        </NavLink>
        <NavLink to="/scan" className={({ isActive }) => (isActive ? 'active' : '')}>
          Consumer Scan
        </NavLink>
      </div>
    </div>
  );
}
