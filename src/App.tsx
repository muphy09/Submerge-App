import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import './App.css';

const APP_VERSION = '1.0.0';

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/proposal/new" element={<ProposalForm />} />
          <Route path="/proposal/edit/:proposalNumber" element={<ProposalForm />} />
          <Route path="/proposal/view/:proposalNumber" element={<ProposalView />} />
        </Routes>
        <div className="app-version">v{APP_VERSION}</div>
      </div>
    </Router>
  );
}

export default App;
