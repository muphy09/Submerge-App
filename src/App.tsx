import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import UpdateNotification from './components/UpdateNotification';
import SettingsModal from './components/SettingsModal';
import './App.css';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [updateStatus, setUpdateStatus] = useState<'downloading' | 'ready' | 'error' | null>(null);
  const [updateError, setUpdateError] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Listen for proposals opened from file system
    if (window.electron && window.electron.onOpenProposal) {
      window.electron.onOpenProposal((proposal: any) => {
        // Navigate to the proposal view page
        navigate(`/proposal/view/${proposal.proposalNumber}`);
      });
    }

    // Listen for update events
    if (window.electron) {
      window.electron.onUpdateAvailable(() => {
        setUpdateStatus('downloading');
      });

      window.electron.onUpdateDownloaded(() => {
        setUpdateStatus('ready');
      });

      window.electron.onUpdateError((error: string) => {
        setUpdateStatus('error');
        setUpdateError(error);
        // Clear error after 10 seconds
        setTimeout(() => setUpdateStatus(null), 10000);
      });
    }
  }, [navigate]);

  const handleInstallUpdate = () => {
    if (window.electron) {
      window.electron.installUpdate();
    }
  };

  return (
    <div className="app">
      <button
        className="settings-button"
        onClick={() => setShowSettings(true)}
        title="Settings"
      >
        ⚙️
      </button>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/proposal/new" element={<ProposalForm key="new" />} />
        <Route path="/proposal/edit/:proposalNumber" element={<ProposalForm key={location.pathname} />} />
        <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
      </Routes>
      <div className="app-version">v{window.electron?.appVersion || '1.0.5'}</div>
      <UpdateNotification
        status={updateStatus}
        onInstall={handleInstallUpdate}
        errorMessage={updateError}
      />
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
