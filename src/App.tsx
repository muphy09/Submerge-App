import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ProposalForm from './pages/ProposalForm';
import ProposalView from './pages/ProposalView';
import './App.css';

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
      </div>
    </Router>
  );
}

export default App;
