import { RETIRED_EQUIPMENT_TOOLTIP } from '../utils/retiredEquipment';
import './RetiredEquipmentIndicator.css';

type Props = {
  tooltip?: string;
  size?: number;
  className?: string;
};

function RetiredEquipmentIndicator({
  tooltip = RETIRED_EQUIPMENT_TOOLTIP,
  size = 14,
  className = '',
}: Props) {
  const classes = ['retired-equipment-indicator', className].filter(Boolean).join(' ');
  return (
    <span className={classes} title={tooltip} aria-label={tooltip} role="img">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3L22 21H2L12 3Z" fill="#ef4444" stroke="#b91c1c" strokeWidth="1.5" />
        <path d="M8.5 9.5L15.5 16.5M15.5 9.5L8.5 16.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export default RetiredEquipmentIndicator;
