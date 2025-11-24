import { NavLink } from 'react-router-dom';
import ppasLogo from '../../PPAS Logo.png';
import './NavigationBar.css';

interface NavigationBarProps {
  userName?: string;
}

function NavigationBar({ userName = 'User' }: NavigationBarProps) {
  return (
    <nav className="navigation-bar">
      <div className="nav-left">
        <img src={ppasLogo} alt="PPAS Logo" className="nav-logo" />
        <div className="nav-title">Proposal Builder</div>
      </div>

      <div className="nav-center">
        <NavLink
          to="/"
          end
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/proposals"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Proposals
        </NavLink>
        <NavLink
          to="/templates"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Templates
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          Settings
        </NavLink>
      </div>

      <div className="nav-right">
        <span className="nav-welcome">Welcome,</span>
        <span className="nav-username">{userName}</span>
        <div className="nav-avatar">
          {userName.charAt(0).toUpperCase()}
        </div>
      </div>
    </nav>
  );
}

export default NavigationBar;
