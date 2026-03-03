import { NavLink } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import FranchiseLogo from './FranchiseLogo';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import './NavigationBar.css';

interface NavigationBarProps {
  userName?: string;
  onLogout?: () => void;
  isAdmin?: boolean;
  isMaster?: boolean;
  franchiseId?: string;
  actingAsLabel?: string;
  onStopActing?: () => void;
}

function NavigationBar({
  userName = 'User',
  onLogout,
  isAdmin = false,
  isMaster = false,
  franchiseId,
  actingAsLabel,
  onStopActing,
}: NavigationBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { displayName } = useFranchiseAppName(franchiseId);

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
        <FranchiseLogo className="nav-logo" alt="Franchise Logo" franchiseId={franchiseId} />
        <div className="nav-title-container">
          <div className="nav-brand">{displayName}</div>
          <div className="nav-title-row">
            <div className="nav-title">Proposal Builder</div>
            {actingAsLabel && (
              <div className="nav-acting">
                <span className="nav-acting-text">Acting as Owner for Franchise {actingAsLabel}</span>
                {onStopActing && (
                  <button className="nav-acting-btn" type="button" onClick={onStopActing}>
                    Sign Out
                  </button>
                )}
              </div>
            )}
          </div>
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
        {isMaster && (
          <NavLink
            to="/master"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Master
          </NavLink>
        )}
      </div>

      <div className="nav-right" ref={menuRef}>
        <button className="nav-userbox" type="button" onClick={() => setMenuOpen((open) => !open)}>
          <span className="nav-welcome">Welcome,</span>
          <span className="nav-username">{userName}</span>
          <div className="nav-avatar">{userName.charAt(0).toUpperCase()}</div>
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
