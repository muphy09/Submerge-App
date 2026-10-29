import { TooltipAnchor } from './AppTooltip';
import { Fragment, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import type { Proposal } from '../types/proposal-new';
import type { PricingData } from '../services/pricingTiers';
import { loadPricingSnapshotForExistingProposal } from '../services/pricingDataStore';
import { proposalSelectionRows, formatMoney, titleCase } from '../utils/contributionReview';
import { eligibleComparisonVersion, savedVersionPrices, savedSelectionAmount, savedContractPrice, versionKey, priceDifference } from '../utils/versionComparison';
import './VersionComparisonModal.css';

// Keep a version's color when it moves between baseline and comparison columns.
const versionColors = [
  { background: '#e6eff9', accent: '#6d8eaf' },
  { background: '#fcf2df', accent: '#b19868' },
  { background: '#e5f1e9', accent: '#78a18a' },
  { background: '#eee7f6', accent: '#9b82b5' },
  { background: '#f8e7e8', accent: '#b6858e' },
  { background: '#e2f1f3', accent: '#709da5' },
];
type Props = { versions: Proposal[]; initialBaselineId: string; showCogs: boolean; onShowCogsChange: (value: boolean) => void; onClose: () => void };
export default function VersionComparisonModal({ versions, initialBaselineId, showCogs, onShowCogsChange, onClose }: Props) {
  const eligible = useMemo(() => versions.filter(eligibleComparisonVersion), [versions]);
  const [baselineId, setBaselineId] = useState(initialBaselineId);
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [all, setAll] = useState(false);
  const [tab, setTab] = useState<'changes' | 'prices'>('changes');
  const [search, setSearch] = useState('');
  const cogs = showCogs;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [catalogs, setCatalogs] = useState<Record<string, PricingData>>({});
  const [labelsLoaded, setLabelsLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const tableHead = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    const head = tableHead.current;
    if (!head) return;
    const category = head.closest('table')?.querySelector('.vc-category');
    const update = () => {
      const panel = head.closest<HTMLElement>('.version-compare-scroll');
      panel?.style.setProperty('--vc-header-height', `${head.getBoundingClientRect().height}px`);
      panel?.style.setProperty('--vc-category-height', `${category?.getBoundingClientRect().height || 36}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(head);
    if (category) observer.observe(category);
    const panel = head.closest<HTMLElement>('.version-compare-scroll');
    const stepRow = (event: WheelEvent) => {
      if (!panel || event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return;
      event.preventDefault();
      const rows = [...panel.querySelectorAll<HTMLElement>('tbody tr:not(.vc-category)')];
      const firstCategory = panel.querySelector('.vc-category');
      const top = panel.getBoundingClientRect().top + panel.clientTop + head.getBoundingClientRect().height
        + (firstCategory?.getBoundingClientRect().height || 36);
      const current = rows.findIndex(row => row.getBoundingClientRect().bottom > top + 1);
      if (current < 0) return;
      const next = rows[Math.max(0, Math.min(rows.length - 1, current + Math.sign(event.deltaY)))];
      panel.scrollTo({ top: panel.scrollTop + next.getBoundingClientRect().top - top, behavior: 'instant' });
    };
    panel?.addEventListener('wheel', stepRow, { passive: false });
    return () => { observer.disconnect(); panel?.removeEventListener('wheel', stepRow); };
  }, [comparing]);
  const baseline = eligible.find(v => versionKey(v) === baselineId) || eligible[0];
  const targets = eligible.filter(v => baseline && selected.includes(versionKey(v)) && versionKey(v) !== versionKey(baseline));
  const columns = baseline ? [baseline, ...targets] : [];
  const versionStyle = (v: Proposal): CSSProperties => {
    const color = versionColors[eligible.findIndex(candidate => versionKey(candidate) === versionKey(v)) % versionColors.length];
    return { backgroundColor: color.background, '--vc-version-background': color.background, '--vc-version-accent': color.accent } as CSSProperties;
  };
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => {
    let cancelled = false;
    // Catalogs supply labels only; financial values always come from saved snapshots.
    void Promise.all(eligible.map(async v => {
      try {
        const snapshot = await loadPricingSnapshotForExistingProposal(v.franchiseId, v.pricingModelId,
          v.pricingModelFranchiseId, v.pricingTierId, v.pricingModelRevisionId);
        return [versionKey(v), snapshot.pricing] as const;
      } catch { return null; }
    })).then(entries => { if (!cancelled) { setCatalogs(Object.fromEntries(entries.filter(entry => entry !== null))); setLabelsLoaded(true); } });
    return () => { cancelled = true; };
  }, [eligible]);
  const financial = columns.map(savedVersionPrices);
  const keys = [...new Set(financial.flatMap(result => result.rows.map(row => row.key)))];
  const selections = columns.map(v => proposalSelectionRows(v, catalogs[versionKey(v)]));
  const selectionKeys = [...new Set(selections.flatMap(rows => rows.map(row => row.key)))];
  const amount = (index: number, key: string) => {
    const result = financial[index];
    if (!cogs && result.warning) return null;
    const row = result.rows.find(row => row.key === key);
    return row ? cogs ? row.cogs : row.price : 0;
  };
  const money = (value: number | null | undefined) => value === null || value === undefined ? 'Unavailable' : formatMoney(value);
  const delta = (before: number | null | undefined, after: number | null | undefined) => {
    const difference = priceDifference(before, after);
    return difference === null ? 'Unavailable' : `${difference > 0 ? '+' : ''}${formatMoney(difference)}`;
  };
  const selectionDifference = (key: string, index: number) => priceDifference(
    savedSelectionAmount(columns[0], financial[0].rows, key, cogs),
    savedSelectionAmount(columns[index], financial[index].rows, key, cogs));
  const tableColumnCount = 1 + columns.length + (tab === 'changes' ? targets.length : 0);
  const name = (v: Proposal) => v.versionName || v.versionId || 'Original';
  const changedSelection = (key: string) => selections.slice(1).some(rows => rows.find(row => row.key === key)?.after !== selections[0].find(row => row.key === key)?.after);
  const matches = (label: string) => label.toLowerCase().includes(search.toLowerCase());
  const visibleKeys = tab === 'changes' ? selectionKeys.filter(key => (all || changedSelection(key)) && selections.flat().filter(r => r.key === key).some(r => matches(r.label + ' ' + r.category + ' ' + r.after))) : keys.filter(key => (all || columns.slice(1).some((_, i) => {
    const a = financial[0].rows.find(r => r.key === key), b = financial[i + 1].rows.find(r => r.key === key);
    return priceDifference(amount(0, key), amount(i + 1, key)) !== 0 || a?.detail !== b?.detail;
  })) && financial.flatMap(f => f.rows).filter(r => r.key === key).some(r => matches(r.label + ' ' + r.category + ' ' + r.detail)));
  const groups = new Map<string, string[]>();
  visibleKeys.forEach(key => {
    const row = tab === 'changes' ? selections.flat().find(r => r.key === key)! : financial.flatMap(f => f.rows).find(r => r.key === key)!;
    const category = ({ 'Pool Specs': 'Pool Specifications', 'Tile Coping Decking': 'Tile, Coping & Decking', 'Customer Info': 'Customer Information' } as Record<string, string>)[row.category] || row.category;
    groups.set(category, [...(groups.get(category) || []), key]);
  });
  return <dialog ref={dialog} className={`version-comparison ${comparing ? 'vc-results' : 'vc-picker'}`} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="version-compare-title">
    <header><div><span className="vc-eyebrow">VERSIONS &amp; ADDENDUMS</span><h2 id="version-compare-title">{comparing ? 'Version Comparison' : 'Compare Versions'}</h2>{!comparing && <p>Choose one version as the Baseline and select 1 or more versions to compare against it.</p>}</div><button aria-label="Close comparison" onClick={onClose}>×</button></header>
    {!comparing || !baseline || !targets.length ? <div className="version-compare-picker">
      <label>Baseline<select aria-label="Baseline" value={baseline && versionKey(baseline)} onChange={event => { setBaselineId(event.target.value); setSelected(ids => ids.filter(id => id !== event.target.value)); }}>
        {eligible.map(v => <option key={versionKey(v)} value={versionKey(v)}>{name(v)} · {titleCase(v.status)}</option>)}
      </select></label>
      <fieldset><legend>Compare against</legend>{eligible.filter(v => v !== baseline).map(v => <label key={versionKey(v)}>
        <input type="checkbox" checked={selected.includes(versionKey(v))} onChange={event => setSelected(ids => event.target.checked ? [...ids, versionKey(v)] : ids.filter(id => id !== versionKey(v)))} />
        {name(v)} <small>{titleCase(v.status)}</small></label>)}</fieldset>
      <button className="action-button primary" disabled={!targets.length} onClick={() => setComparing(true)}>Compare Versions</button>
    </div> : <>
      <section className="vc-summary" aria-label="Saved financial summary">{columns.map((v, i) => <article key={versionKey(v)} style={versionStyle(v)}><div className="vc-card-title"><div className="vc-version-heading"><strong>{name(v)}</strong>{i === 0 && <span className="vc-status-pill">Baseline</span>}</div><div className="vc-version-badges"><TooltipAnchor tooltip={v.pricingModelName || 'Saved pricing model'}><span className="vc-model-pill">{v.pricingModelName || 'Saved pricing model'}</span></TooltipAnchor></div></div><b>{money(v.totalCost)}</b>{i > 0 && <span className="vc-delta">{delta(baseline.totalCost, v.totalCost)} vs. baseline</span>}{i === 0 && <span className="vc-delta vc-unchanged">Comparison baseline</span>}<details open={detailsOpen}><summary onClick={event => { event.preventDefault(); setDetailsOpen(open => !open); }}>Contract &amp; pricing details</summary><dl><dt>Contract price</dt><dd>{money(savedContractPrice(v))}</dd><dt>Off-Contract</dt><dd>{money(v.pricing?.offContractTotal)}</dd>{cogs && <><dt>Total COGS</dt><dd>{money(v.pricing?.totalCOGS)}</dd><dt>Gross profit</dt><dd>{money(v.pricing?.grossProfit)} ({v.pricing?.grossProfitMargin?.toFixed(1)}%)</dd></>}</dl></details></article>)}</section>
      <div className="version-compare-controls"><div className="vc-view-search"><div role="tablist" aria-label="Comparison view"><button role="tab" aria-selected={tab === 'changes'} onClick={() => setTab('changes')}>Changes <span>{selectionKeys.filter(changedSelection).length}</span></button><button role="tab" aria-selected={tab === 'prices'} onClick={() => setTab('prices')}>Item Prices</button></div><div className="vc-search"><input type="search" aria-label="Search comparison" placeholder="Find an item or selection…" value={search} onChange={event => setSearch(event.target.value)} /></div></div>
        <label><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)} />Show All Items</label>
        <label><input type="checkbox" checked={cogs} onChange={event => onShowCogsChange(event.target.checked)} />Show COGS</label></div>
      {labelsLoaded && columns.some(v => !catalogs[versionKey(v)]) && <p role="status">Some saved catalogs are unavailable. Selection details may show saved identifiers; financial values still use the saved breakdowns.</p>}
      {financial.map((result, i) => result.warning && <p role="status" key={i}>{name(columns[i])}: {result.warning}</p>)}
      <div className="version-compare-scroll" role="tabpanel" aria-label={tab === 'changes' ? 'Changes' : 'Item Prices'}><table style={{ minWidth: 220 + columns.length * 280 + (tab === 'changes' ? targets.length * 130 : 0) }}><colgroup><col style={{ width: 220 }} />{columns.map((v, i) => <Fragment key={versionKey(v)}><col />{tab === 'changes' && i > 0 && <col style={{ width: 130 }} />}</Fragment>)}</colgroup><thead ref={tableHead}><tr><th scope="col">{tab === 'changes' ? 'Selection' : cogs ? 'COGS Category (COGS Price)' : 'COGS Category (Retail Price)'}</th>{columns.map((v, i) => <Fragment key={versionKey(v)}><th scope="col" style={versionStyle(v)}>{name(v)}{i === 0 ? ' (Baseline)' : ''}
      </th>{tab === 'changes' && i > 0 && <th scope="col" style={versionStyle(v)} className="vc-price-column">{cogs ? 'COGS Cost' : 'Retail Cost'}</th>}</Fragment>)}</tr></thead>

        {[...groups].map(([category, groupKeys]) => <tbody key={category}><tr className="vc-category"><td colSpan={tableColumnCount}><span className="vc-category-label">{category} <span>{groupKeys.length} {groupKeys.length === 1 ? 'item' : 'items'}</span></span></td></tr>{groupKeys.map(key => {
          const row = tab === 'changes' ? selections.flat().find(r => r.key === key)! : financial.flatMap(f => f.rows).find(r => r.key === key)!;
          return <tr key={key}><th scope="row">{row.label}</th>{columns.map((v, i) => {
            const before = selections[0].find(r => r.key === key)?.after || 'Not included';
            const after = selections[i].find(r => r.key === key)?.after || 'Not included';
            const difference = priceDifference(amount(0, key), amount(i, key));
            return <Fragment key={versionKey(v)}><td data-version-value style={versionStyle(v)} className={i > 0 && (tab === 'changes' ? before !== after : difference !== 0) ? 'vc-changed' : ''}>{tab === 'prices' ? <><strong>{money(amount(i, key))}</strong><small>{financial[i].rows.find(r => r.key === key)?.detail || 'Not included'}</small>{i > 0 && <span className="vc-delta">{difference === 0 ? 'No price change' : delta(amount(0, key), amount(i, key))}</span>}</> : i > 0 && before === after && !all ? <span className="vc-unchanged">Same as baseline</span> : after.length > 220 ? <details><summary>{after.slice(0, 100)}… <span>Read more</span></summary><p>{after}</p></details> : after}</td>{tab === 'changes' && i > 0 && <td style={versionStyle(v)} className="vc-price-column"><TooltipAnchor tooltip={selectionDifference(key, i) === null ? 'This selection has no separately identifiable saved item price. See Item Prices for the saved breakdown.' : cogs ? 'Difference between saved item COGS, including overhead.' : 'Difference between saved item retail prices, including overhead and markup.'}><strong>{selectionDifference(key, i) === null ? '—' : delta(0, selectionDifference(key, i))}</strong></TooltipAnchor></td>}</Fragment>;
          })}</tr>;
        })}</tbody>)}
        {groups.size === 0 && <tbody><tr><td colSpan={tableColumnCount} className="vc-empty">{search ? 'No matching items. Try another search.' : 'No differences in this view.'}</td></tr></tbody>}
      </table></div>
      <footer><button className="action-button" onClick={() => setComparing(false)}>Change Selections</button><button className="action-button primary" onClick={onClose}>Done</button></footer>
    </>}
  </dialog>;
}
