import { NavLink } from 'react-router-dom';
import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import FranchiseLogo from './FranchiseLogo';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import './NavigationBar.css';

interface NavigationBarProps {
  userName?: string;
  onLogout?: () => void;
  onProfileSettings?: () => void;
  isAdmin?: boolean;
  isMaster?: boolean;
  franchiseId?: string;
  onAdminPanelClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}

function NavigationBar({
  userName = 'User',
  onLogout,
  onProfileSettings,
  isAdmin = false,
  isMaster = false,
  franchiseId,
  onAdminPanelClick,
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
          </div>
        </div>
      </div>

      <div className="nav-center">
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            onClick={onAdminPanelClick}
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
          <span className="nav-usertext">
            <span className="nav-welcome">Welcome,</span>
            <span className="nav-username">{userName}</span>
          </span>
          <div className="nav-avatar">{userName.charAt(0).toUpperCase()}</div>
        </button>
        {menuOpen && (onProfileSettings || onLogout) && (
          <div className="nav-user-menu">
            {onProfileSettings && (
              <button
                className="nav-user-menu-item nav-profile-settings"
                onClick={() => {
                  setMenuOpen(false);
                  onProfileSettings();
                }}
                type="button"
              >
                Profile Settings
              </button>
            )}
            {onProfileSettings && onLogout && <div className="nav-user-menu-divider" />}
            {onLogout && (
              <button
                className="nav-user-menu-item nav-logout"
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                type="button"
              >
                Logout
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

export default NavigationBar;
