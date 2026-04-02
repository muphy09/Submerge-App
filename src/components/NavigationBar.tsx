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
  showWorkflowTab?: boolean;
  workflowUnreadCount?: number;
  onAdminPanelClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}

function NavigationBar({
  userName = 'User',
  onLogout,
  onProfileSettings,
  isAdmin = false,
  isMaster = false,
  franchiseId,
  showWorkflowTab = false,
  workflowUnreadCount = 0,
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
        <div className="nav-links-primary">
          {showWorkflowTab && (
            <NavLink
              to="/workflow"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-link-content">
                <span>Book Keeper</span>
                {workflowUnreadCount > 0 && <span className="nav-unread-pill">{workflowUnreadCount}</span>}
              </span>
            </NavLink>
          )}
          <NavLink
            to="/"
            end
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <span className="nav-link-content">
              <span>Dashboard</span>
            </span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <span className="nav-link-content">
              <span>Settings</span>
            </span>
          </NavLink>
          {isMaster && (
            <NavLink
              to="/master"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <span className="nav-link-content">
                <span>Master</span>
              </span>
            </NavLink>
          )}
        </div>

        {isAdmin && (
          <div className="nav-links-admin">
            <NavLink
              to="/admin"
              className={({ isActive }) => (isActive ? 'nav-link nav-link-admin active' : 'nav-link nav-link-admin')}
              onClick={onAdminPanelClick}
            >
              <span className="nav-link-content">
                <span>Admin Panel</span>
              </span>
            </NavLink>
          </div>
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
