import { NavLink } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import submergeLogo from '../../Submerge Logo.png';
import './NavigationBar.css';

interface NavigationBarProps {
  userName?: string;
  onLogout?: () => void;
  isAdmin?: boolean;
}

function NavigationBar({ userName = 'User', onLogout, isAdmin = false }: NavigationBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <nav className="navigation-bar">
      <div className="nav-left">
        <img src={submergeLogo} alt="Submerge Logo" className="nav-logo" />
        <div className="nav-title-container">
          <div className="nav-brand">Submerge</div>
          <div className="nav-title">Proposal Builder</div>
        </div>
      </div>

      <div className="nav-center">
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Admin Panel
          </NavLink>
        )}
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/proposals"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          Proposals
        </NavLink>
        <NavLink
          to="/templates"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          Templates
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
        >
          Settings
        </NavLink>
      </div>

      <div className="nav-right" ref={menuRef}>
        <button className="nav-userbox" type="button" onClick={() => setMenuOpen((open) => !open)}>
          <span className="nav-welcome">Welcome,</span>
          <span className="nav-username">{userName}</span>
          <div className="nav-avatar">{userName.charAt(0).toUpperCase()}</div>
          <span className="nav-caret">{menuOpen ? '^' : 'v'}</span>
        </button>
        {menuOpen && onLogout && (
          <div className="nav-user-menu">
            <button
              className="nav-logout"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              type="button"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

export default NavigationBar;
