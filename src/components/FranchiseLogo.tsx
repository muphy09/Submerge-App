import { useFranchiseLogo } from '../hooks/useFranchiseLogo';
import submergeLogo from '../../Submerge Logo.png';

type FranchiseLogoProps = {
  className?: string;
  alt?: string;
  franchiseId?: string;
};

function FranchiseLogo({ className, alt = 'Franchise logo', franchiseId }: FranchiseLogoProps) {
  const { logoUrl } = useFranchiseLogo(franchiseId);
  const src = logoUrl || submergeLogo;

  return <img src={src} alt={alt} className={className} />;
}

export default FranchiseLogo;
