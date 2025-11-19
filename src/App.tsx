import { HashRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import './App.css';

const APP_VERSION = '1.0.0';

function AppContent() {
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for proposals opened from file system
    if (window.electron && window.electron.onOpenProposal) {
      window.electron.onOpenProposal((proposal: any) => {
        // Navigate to the proposal view page
        navigate(`/proposal/view/${proposal.proposalNumber}`);
      });
    }
  }, [navigate]);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/proposal/new" element={<ProposalForm />} />
        <Route path="/proposal/edit/:proposalNumber" element={<ProposalForm />} />
        <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
      </Routes>
      <div className="app-version">v{APP_VERSION}</div>
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
