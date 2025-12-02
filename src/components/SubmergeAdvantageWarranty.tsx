import { Proposal, InteriorFinishType } from '../types/proposal-new';
import submergeLogo from '../../Submerge Logo.png';
import './SubmergeAdvantageWarranty.css';

interface WarrantyItem {
  label: string;
  detail?: string;
  advantage?: string;
}

interface WarrantySection {
  title: string;
  icon: SectionIconKey;
  items: WarrantyItem[];
}

type SectionIconKey =
  | 'dimensions'
  | 'steps'
  | 'plans'
  | 'excavation'
  | 'steel'
  | 'plumbing'
  | 'electric'
  | 'shotcrete'
  | 'tile'
  | 'equipment'
  | 'cleanup'
  | 'startup';

const sectionIconMap: Record<SectionIconKey, JSX.Element> = {
  dimensions: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="7" width="14" height="10" rx="2" ry="2" fill="none" strokeWidth="1.8" />
      <path d="M7 12h10M12 9v6" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  steps: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16h5v-3h5v-3h3" fill="none" strokeWidth="1.8" />
      <path d="M6 20V8h12" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="4" width="12" height="16" rx="2" ry="2" fill="none" strokeWidth="1.8" />
      <path d="M9 8h6M9 12h6M9 16h3" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  excavation: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16h8l1.5-3.5L11 9 8.5 4 6 9l-2 7z" fill="none" strokeWidth="1.8" />
      <path d="M14 14h6l-2 4h-5" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  steel: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M6 18 18 6" fill="none" strokeWidth="1.8" />
      <path d="M4 10h16M4 14h16" fill="none" strokeWidth="1.6" />
    </svg>
  ),
  plumbing: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h6v6H6zM12 7h6v6h-6zM6 14h6v6H6z" fill="none" strokeWidth="1.8" />
      <path d="M12 10h3M9 14v-4" fill="none" strokeWidth="1.6" />
    </svg>
  ),
  electric: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 6 13h5l-1 8 6-10h-5z" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  shotcrete: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 16c2 0 3.5-2 5.5-2S14 16 16 16s3.5-2 5.5-2" fill="none" strokeWidth="1.8" />
      <path d="M5 12c2 0 3.5-2 5.5-2S14 12 16 12s3.5-2 5.5-2" fill="none" strokeWidth="1.8" />
      <path d="M4 7h16" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  tile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="6" height="6" fill="none" strokeWidth="1.8" />
      <rect x="13" y="5" width="6" height="6" fill="none" strokeWidth="1.8" />
      <rect x="5" y="13" width="6" height="6" fill="none" strokeWidth="1.8" />
      <rect x="13" y="13" width="6" height="6" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  equipment: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" strokeWidth="1.8" />
      <path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M6.8 6.8 5.4 5.4M18.6 18.6l-1.4-1.4M6.8 17.2 5.4 18.6M18.6 5.4l-1.4 1.4" fill="none" strokeWidth="1.8" />
    </svg>
  ),
  cleanup: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4h10l-1 15H8z" fill="none" strokeWidth="1.8" />
      <path d="M10 4V3a2 2 0 1 1 4 0v1" fill="none" strokeWidth="1.8" />
      <path d="M9 9h6" fill="none" strokeWidth="1.6" />
    </svg>
  ),
  startup: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v6l4 2-4 2-4-2 4-2" fill="none" strokeWidth="1.8" />
      <circle cx="12" cy="14" r="6" fill="none" strokeWidth="1.8" />
    </svg>
  ),
};

const SectionIcon = ({ name }: { name: SectionIconKey }) => (
  <span className="warranty-title-icon">{sectionIconMap[name]}</span>
);

const interiorFinishLabels: Partial<Record<InteriorFinishType, string>> = {
  'pebble-tec-l1': 'Pebble Tec - Level 1',
  'pebble-tec-l2': 'Pebble Tec - Level 2',
  'pebble-tec-l3': 'Pebble Tec - Level 3',
  'pebble-sheen-l1': 'Pebble Sheen - Level 1',
  'pebble-sheen-l2': 'Pebble Sheen - Level 2',
  'pebble-sheen-l3': 'Pebble Sheen - Level 3',
  'pebble-fina-l1': 'Pebble Fina - Level 1',
  'pebble-fina-l2': 'Pebble Fina - Level 2',
  'pebble-brilliance': 'Pebble Brilliance',
  'pebble-breeze': 'Pebble Breeze',
};

const formatNumber = (value?: number, digits = 1) =>
  value !== undefined && value !== null && !Number.isNaN(value)
    ? Number(value).toFixed(digits).replace(/\.0+$/, '')
    : '0';

const buildPoolDetail = (proposal?: Partial<Proposal>) => {
  const poolSpecs = proposal?.poolSpecs;
  if (!poolSpecs) return 'Pool details not set';

  const isFiberglass = poolSpecs.poolType === 'fiberglass';

  if (isFiberglass) {
    if (poolSpecs.fiberglassModelName) return poolSpecs.fiberglassModelName;
    if (poolSpecs.fiberglassSize) return `Fiberglass (${poolSpecs.fiberglassSize})`;
    return 'Fiberglass pool';
  }

  const width = formatNumber(poolSpecs.maxWidth);
  const length = formatNumber(poolSpecs.maxLength);
  const shallow = formatNumber(poolSpecs.shallowDepth);
  const deep = formatNumber(poolSpecs.endDepth);

  return `Width ${width}ft x Length ${length}ft (Shallow ${shallow}ft / Deep ${deep}ft)`;
};

const buildSpaDetail = (proposal?: Partial<Proposal>) => {
  const poolSpecs = proposal?.poolSpecs;
  if (!poolSpecs || poolSpecs.spaType === 'none') {
    return { detail: 'No spa', advantage: 'No spa' };
  }

  const width = formatNumber(poolSpecs.spaWidth);
  const length = formatNumber(poolSpecs.spaLength);
  const shape = poolSpecs.spaShape ? ` ${poolSpecs.spaShape} spa` : ' spa';

  return {
    detail: `${width}ft x ${length}ft${shape}`,
    advantage: 'Split bench for customized therapy',
  };
};

const buildInteriorFinishDetail = (proposal?: Partial<Proposal>) => {
  const poolSpecs = proposal?.poolSpecs;
  const interior = proposal?.interiorFinish;
  if (!poolSpecs || poolSpecs.poolType === 'fiberglass' || !interior) return undefined;

  const label = interiorFinishLabels[interior.finishType] ?? 'Interior finish';
  const color = interior.color ? ` - ${interior.color}` : '';
  return `${label}${color}`;
};

const buildEquipmentItems = (proposal?: Partial<Proposal>): WarrantyItem[] => {
  const equipment = proposal?.equipment;
  const items: WarrantyItem[] = [];

  if (!equipment) {
    return [
      { label: 'Equipment selections not set yet', advantage: '3-Year NO-FAULT Warranty on all Jandy equipment' },
    ];
  }

  const lightsCount = equipment.numberOfLights ?? 0;
  const lightsText = lightsCount > 0
    ? `${lightsCount} low-voltage Submerge colored LED light${lightsCount === 1 ? '' : 's'}${equipment.hasSpaLight ? ' (spa light included)' : ''}`
    : 'No pool lights specified yet';

  items.push({
    label: equipment.pump?.name || 'Primary pump not selected',
    advantage: '3-Year NO-FAULT Warranty on all Jandy equipment',
  });

  const auxiliaryPumps =
    equipment.auxiliaryPumps && equipment.auxiliaryPumps.length > 0
      ? equipment.auxiliaryPumps
      : equipment.auxiliaryPump
        ? [equipment.auxiliaryPump]
        : [];
  auxiliaryPumps.forEach((pump) => {
    if (pump?.name) {
      items.push({ label: pump.name });
    }
  });

  items.push(
    { label: equipment.filter?.name || 'Filter not selected' },
    {
      label: equipment.heater?.name
        ? equipment.upgradeToVersaFlo
          ? `${equipment.heater.name} (VersaFlo upgrade)`
          : equipment.heater.name
        : 'Heater not selected',
    },
    { label: equipment.cleaner?.name || 'Cleaner not selected' },
    { label: equipment.automation?.name || 'Automation not selected' },
  );

  if (equipment.saltSystem?.name) {
    items.push({ label: equipment.saltSystem.name });
  } else {
    items.push({ label: 'Sanitation system not selected' });
  }

  items.push({ label: lightsText });

  return items;
};

const buildWarrantySections = (proposal?: Partial<Proposal>): WarrantySection[] => {
  const poolSpecs = proposal?.poolSpecs;
  const excavation = proposal?.excavation;
  const isFiberglass = poolSpecs?.poolType === 'fiberglass';

  const spa = buildSpaDetail(proposal);
  const interiorFinishDetail = buildInteriorFinishDetail(proposal);
  const dirtHaulText = excavation?.hasDirtHaul ? 'Dirt haul off included' : 'Dirt to remain at property';

  const sections: WarrantySection[] = [
    {
      title: 'Dimensions',
      icon: 'dimensions',
      items: [
        { label: 'Pool Dimensions (Feet)', detail: buildPoolDetail(proposal) },
        { label: 'Spa Dimensions (Feet)', detail: spa.detail, advantage: spa.advantage },
      ],
    },
    {
      title: 'Steps & Benches',
      icon: 'steps',
      items: [
        { label: 'One set of shallow-end access steps' },
        { label: 'Deep-end loveseat bench', advantage: 'For safety and relaxing' },
      ],
    },
    {
      title: 'Plans, Permits & Insurance',
      icon: 'plans',
      items: [
        {
          label: 'Detailed construction plans in advance for approval prior to excavation',
          advantage: 'Ensures clear understanding of project details',
        },
        { label: 'Engineered structural plans', advantage: 'Certificates available upon request' },
        { label: 'All required building permits' },
        { label: 'Underground services alert called prior to excavation' },
        { label: 'Commercial liability and auto insurance on all work' },
        { label: 'Employees covered by Workers Compensation Insurance' },
        { label: 'Taxes on all materials and equipment included in contract price' },
        { label: 'Lien releases available throughout construction' },
        { label: 'Submerge is licensed and bonded in accordance with State Contractors Board Regulations' },
      ],
    },
    {
      title: 'Excavation',
      icon: 'excavation',
      items: [
        { label: 'Pool layout prior to excavation', advantage: 'Pool is painted on ground for visual approval by homeowner' },
        { label: 'Pool hand contoured', advantage: 'Hand trimming assures uniform wall and floor thickness with proper cove radius' },
      ],
    },
    {
      title: 'Steel',
      icon: 'steel',
      items: isFiberglass
        ? [{ label: 'Fiberglass shell', detail: 'No steel required' }]
        : [
            {
              label: '4 bar bond beam with 1/2 inch steel; 3/8 inch rebar on 10 inch centers through pool',
              advantage: 'Our bond beam and wall steel schedules are beyond code for protection against expansive soils',
            },
            {
              label: '10 inch on center in transition slope by 20 feet length',
              advantage: 'Strongest steel schedule in the industry!',
            },
            { label: '8" on center in the deep end and coves' },
          ],
    },
    {
      title: 'Plumbing',
      icon: 'plumbing',
      items: [
        { label: '2 1/2 inch suction line', advantage: 'Submerge Stealth Series pump' },
        { label: '2 1/2 inch suction line for all pump motors larger than 1.0 HP', advantage: 'Submerge High-Performance circulation pump' },
        { label: '2 inch return line (to 1st tee)', advantage: 'Submerge booster pump' },
        { label: 'When possible 45-degree elbows are used rather than 90-degree to improve efficiency and performance' },
        { label: 'Separate skimmer and main drain suction - allows for maximum performance' },
        { label: 'Heavy duty surface skimmer' },
        { label: 'Jandy Ball Valves' },
        { label: 'Hose bib at pad for draining pool' },
        { label: 'All circulation lines are pressure tested throughout construction' },
      ],
    },
    {
      title: 'Electric',
      icon: 'electric',
      items: [
        { label: 'Breakers at pad included', advantage: 'Protected outlet for homeowner convenience' },
        { label: '110 volt GFI protected light circuit with outlet' },
        { label: '220 volt pump circuit' },
        { label: 'Jandy IQ20 pump controller', advantage: 'Control your pump from your phone' },
        { label: 'Bonding as per N.E.C. Code' },
        { label: '(2) Low-voltage Submerge colored LED lights' },
      ],
    },
    {
      title: 'Shotcrete',
      icon: 'shotcrete',
      items: isFiberglass
        ? [{ label: 'No shotcrete required', detail: 'Fiberglass shell install' }]
        : [
            { label: '4,000 PSI pneumatically applied shotcrete', advantage: 'Lifetime structural warranty' },
            { label: 'All shotcrete is measured by a certified weighmaster' },
            { label: 'All nozzlemen are certified for State and Municipal work' },
            { label: 'Lifetime structural warranty' },
          ],
    },
    {
      title: 'Tile & Masonry',
      icon: 'tile',
      items: isFiberglass
        ? [{ label: 'Fiberglass shell - no tile required' }]
        : [
            { label: 'All pool and spa waterline tile including the skimmer throat', advantage: 'Frost-proof tiles in a variety of patterns and colors' },
            { label: 'Trim tile available on steps and benches', advantage: 'By request at extra cost for safety and beauty' },
          ],
    },
    {
      title: 'Equipment',
      icon: 'equipment',
      items: buildEquipmentItems(proposal),
    },
    {
      title: 'Clean Up & Interior',
      icon: 'cleanup',
      items: [
        { label: 'All trenches filled and yard rough graded' },
        { label: 'All construction debris hauled away' },
        ...(interiorFinishDetail ? [{ label: interiorFinishDetail, advantage: 'Combines durability and functionality' }] : []),
        { label: 'VGB compliant main drain covers' },
        { label: dirtHaulText },
        { label: 'Pool filled with water', advantage: 'Water trucks included' },
      ],
    },
    {
      title: 'Start Up & Orientation',
      icon: 'startup',
      items: [
        { label: 'Equipment turned on and started-up', advantage: 'Pool maintenance and equipment fully explained' },
        { label: 'Initial chemical balance', advantage: 'Program cycles set for ideal run times' },
        { label: '"Pool School" / Orientation', advantage: 'Report card allows you to provide feedback' },
      ],
    },
  ];

  return sections;
};

interface Props {
  proposal?: Partial<Proposal>;
}

function SubmergeAdvantageWarranty({ proposal }: Props) {
  const sections = buildWarrantySections(proposal);
  const customerName = (proposal?.customerInfo?.customerName || '').trim();

  return (
    <div className="warranty-sheet">
      <div className="warranty-header">
        <div>
          <p className="warranty-eyebrow">Warranty & Inclusions Overview</p>
          <h2>Warranty & Inclusions</h2>
          <p className="warranty-subtitle">
            Prepared for: <span className="warranty-customer">{customerName || 'N/A'}</span>
          </p>
        </div>
        <div className="warranty-logo">
          <img src={submergeLogo} alt="Submerge Logo" />
        </div>
      </div>

      <div className="warranty-section-stack">
        {sections.map((section) => {
          const advantages = section.items.filter((item) => item.advantage);

          return (
            <div key={section.title} className="warranty-section">
              <div className="warranty-section-card">
                <div className="warranty-section-heading">
                  <div className="warranty-title-wrap">
                    <SectionIcon name={section.icon} />
                    <span className="warranty-section-title">{section.title}</span>
                  </div>
                  <div className="submerge-chip">
                    <span className="submerge-chip-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path
                          d="M9 3h6l4 4v6l-4 4H9l-4-4V7z"
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                        <path
                          d="m9.75 12.25 1.75 1.75 3.75-3.75"
                          fill="none"
                          stroke="white"
                          strokeWidth="2.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    Warranty Advantage
                  </div>
                </div>

                <div className="warranty-section-body">
                  <div className="warranty-feature-list">
                    {section.items.map((item, idx) => (
                      <div key={`${section.title}-${idx}`} className="warranty-feature">
                        <span className="feature-check" aria-hidden="true" />
                        <div className="feature-copy">
                          <div className="feature-label">{item.label}</div>
                          {item.detail && <div className="feature-detail">{item.detail}</div>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="warranty-advantage-column">
                    {advantages.length > 0 ? (
                      advantages.map((item, idx) => (
                        <div key={`${section.title}-adv-${idx}`} className="warranty-advantage-card">
                          {item.advantage}
                        </div>
                      ))
                    ) : (
                      <div className="warranty-advantage-card muted">No Submerge advantages listed.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SubmergeAdvantageWarranty;
