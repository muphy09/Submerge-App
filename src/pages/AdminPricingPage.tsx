import { useNavigate } from 'react-router-dom';
import PricingDataModal from '../components/PricingDataModal';

interface AdminPricingPageProps {
  franchiseId?: string | null;
  franchiseCode?: string | null;
}

function AdminPricingPage({ franchiseId, franchiseCode }: AdminPricingPageProps) {
  const navigate = useNavigate();

  return (
    <PricingDataModal
      franchiseId={franchiseId}
      franchiseCode={franchiseCode}
      onClose={() => navigate('/admin')}
    />
  );
}

export default AdminPricingPage;
