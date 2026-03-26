import { useNavigate } from 'react-router-dom';
import PricingDataModal from '../components/PricingDataModal';

interface AdminPricingPageProps {
  franchiseId?: string | null;
}

function AdminPricingPage({ franchiseId }: AdminPricingPageProps) {
  const navigate = useNavigate();

  return (
    <PricingDataModal
      franchiseId={franchiseId}
      onClose={() => navigate('/admin')}
    />
  );
}

export default AdminPricingPage;
