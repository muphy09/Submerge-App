import { Proposal, InteriorFinishType } from '../types/proposal-new';
import ppasLogo from '../../PPAS Logo.png';
import './PremierAdvantageWarranty.css';

interface WarrantyItem {
  label: string;
  detail?: string;
  advantage?: string;
}

interface WarrantySection {
  title: string;
  items: WarrantyItem[];
}

const interiorFinishLabels: Partial<Record<InteriorFinishType, string>> = {
  plaster: 'Plaster (White/Color)',
  'pebble-tec': 'Pebble Tec',
  'pebble-sheen': 'Pebble Sheen',
  'pebble-fina': 'Pebble Fina',
  'mini-pebble': 'Mini Pebble',
  beadcrete: 'Beadcrete',
  'quartz-scapes': 'Quartz Scapes',
  hydrazzo: 'Hydrazzo',
  tile: 'Tile (Full)',
  'ivory-quartz': 'Ivory Quartz',
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
  'pebble-essence': 'Pebble Essence',
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
    ? `${lightsCount} low-voltage Premier colored LED light${lightsCount === 1 ? '' : 's'}${equipment.hasSpaLight ? ' (spa light included)' : ''}`
    : 'No pool lights specified yet';

  items.push({
    label: equipment.pump?.name || 'Primary pump not selected',
    advantage: '3-Year NO-FAULT Warranty on all Jandy equipment',
  });

  if (equipment.auxiliaryPump?.name) {
    items.push({ label: equipment.auxiliaryPump.name });
  }

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
    items.push({ label: 'Salt system not selected' });
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
      items: [
        { label: 'Pool Dimensions (Feet)', detail: buildPoolDetail(proposal) },
        { label: 'Spa Dimensions (Feet)', detail: spa.detail, advantage: spa.advantage },
      ],
    },
    {
      title: 'Steps & Benches',
      items: [
        { label: 'One set of shallow-end access steps' },
        { label: 'Deep-end loveseat bench', advantage: 'For safety and relaxing' },
      ],
    },
    {
      title: 'Plans, Permits & Insurance',
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
        { label: 'Premier is licensed and bonded in accordance with State Contractors Board Regulations' },
      ],
    },
    {
      title: 'Excavation',
      items: [
        { label: 'Pool layout prior to excavation', advantage: 'Pool is painted on ground for visual approval by homeowner' },
        { label: 'Pool hand contoured', advantage: 'Hand trimming assures uniform wall and floor thickness with proper cove radius' },
      ],
    },
    {
      title: 'Steel',
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
      items: [
        { label: '2 1/2 inch suction line', advantage: 'Premier Stealth Series pump' },
        { label: '2 1/2 inch suction line for all pump motors larger than 1.0 HP', advantage: 'Premier High-Performance circulation pump' },
        { label: '2 inch return line (to 1st tee)', advantage: 'Premier booster pump' },
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
      items: [
        { label: 'Breakers at pad included', advantage: 'Protected outlet for homeowner convenience' },
        { label: '110 volt GFI protected light circuit with outlet' },
        { label: '220 volt pump circuit' },
        { label: 'Jandy IQ20 pump controller', advantage: 'Control your pump from your phone' },
        { label: 'Bonding as per N.E.C. Code' },
        { label: '(2) Low-voltage Premier colored LED lights' },
      ],
    },
    {
      title: 'Shotcrete',
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
      items: isFiberglass
        ? [{ label: 'Fiberglass shell - no tile required' }]
        : [
            { label: 'All pool and spa waterline tile including the skimmer throat', advantage: 'Frost-proof tiles in a variety of patterns and colors' },
            { label: 'Trim tile available on steps and benches', advantage: 'By request at extra cost for safety and beauty' },
          ],
    },
    {
      title: 'Equipment',
      items: buildEquipmentItems(proposal),
    },
    {
      title: 'Clean Up & Interior',
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

function PremierAdvantageWarranty({ proposal }: Props) {
  const sections = buildWarrantySections(proposal);
  const customerName = (proposal?.customerInfo?.customerName || '').trim();

  return (
    <div className="warranty-sheet">
      <div className="warranty-header">
        <div>
          <p className="warranty-eyebrow">Premier Advantage</p>
          <h2>Warranty & Inclusions</h2>
          <p className="warranty-subtitle">
            Prepared for: <span className="warranty-customer">{customerName}</span>
          </p>
        </div>
        <div className="warranty-logo">
          <img src={ppasLogo} alt="PPAS Logo" />
        </div>
      </div>

      {sections.map((section) => (
        <div key={section.title} className="warranty-section">
          <div className="warranty-section-grid">
            <div className="warranty-section-title">{section.title}</div>
            <div className="warranty-advantage-title">Premier Advantage</div>

            <div className="warranty-items">
              {section.items.map((item, idx) => (
                <div key={`${section.title}-${idx}`} className="warranty-item-row">
                  <div className="warranty-label">{item.label}</div>
                  {item.detail && <div className="warranty-detail">{item.detail}</div>}
                </div>
              ))}
            </div>

            <div className="warranty-advantage-panel">
              <div className="warranty-advantage-stack">
                {section.items.filter(i => i.advantage).length > 0 ? (
                  section.items
                    .filter(i => i.advantage)
                    .map((item, idx) => (
                      <div key={`${section.title}-adv-${idx}`} className="warranty-advantage-text">
                        {item.advantage}
                      </div>
                    ))
                ) : (
                  <div className="warranty-advantage-text muted">—</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default PremierAdvantageWarranty;
