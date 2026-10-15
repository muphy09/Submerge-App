import { useMemo, useState } from 'react';
import type { CategoryAdjustment, AdjustmentCondition } from '../types/categoryAdjustments';
import { CATEGORY_ADJUSTMENT_CATEGORIES, getConditionBillingCategory, validateCategoryAdjustments } from '../utils/categoryAdjustments';
import { conditionError, describeCategoryAdjustment, getCategoryConditionTargets, NUMERIC_OPERATORS } from '../utils/categoryAdjustmentConditions';
import './CategoryAdjustmentsEditor.css';

interface Props {
  pricing: any;
  disabled?: boolean;
  onChange: (adjustments: CategoryAdjustment[]) => void;
}

export default function CategoryAdjustmentsEditor({ pricing, disabled, onChange }: Props) {
  const adjustments: CategoryAdjustment[] = pricing.categoryAdjustments || [];
  const targets = useMemo(() => getCategoryConditionTargets(pricing), [pricing]);
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const [attemptedSaveIds, setAttemptedSaveIds] = useState<Set<string>>(() => new Set());
  const update = (index: number, changes: Partial<CategoryAdjustment>) => onChange(adjustments.map((a, i) => i === index ? { ...a, ...changes } : a));
  const edit = (id: string) => setEditingIds(ids => new Set([...ids, id]));
  const remove = (index: number) => {
    const id = adjustments[index].id;
    onChange(adjustments.filter((_, i) => i !== index));
    setEditingIds(ids => new Set([...ids].filter(value => value !== id)));
    setAttemptedSaveIds(ids => new Set([...ids].filter(value => value !== id)));
  };
  return (
    <div className="category-adjustments-editor">
      {adjustments.length === 0 && <p>No category adjustments. Existing prices are unchanged.</p>}
      {adjustments.map((adjustment, index) => {
        const explanation = describeCategoryAdjustment(adjustment, targets);
        const rowError = validateCategoryAdjustments([adjustment], pricing, targets);
        if (!editingIds.has(adjustment.id)) return (
          <div className="category-adjustment-summary" key={adjustment.id}>
            <div className="category-adjustment-summary-copy">
              <div className="category-adjustment-summary-heading">
                <strong>{adjustment.title || 'Untitled adjustment'}</strong>
                <span className="category-adjustment-summary-amount">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(adjustment.amount || 0)}</span>
                <span className="category-adjustment-badge">{adjustment.basis === 'cogs' ? 'COGS' : 'Retail'}</span>
                <span className="category-adjustment-badge">{adjustment.mode === 'static' ? 'Static' : 'Conditional'}</span>
              </div>
              <p>{explanation}</p>
              {rowError && <p className="category-adjustment-error" role="alert">{rowError}</p>}
            </div>
            <div className="category-adjustment-actions">
              <button type="button" className="category-adjustment-edit" disabled={disabled} onClick={() => edit(adjustment.id)}>Edit</button>
              <button type="button" className="category-adjustment-remove" disabled={disabled} onClick={() => remove(index)}>Remove adjustment</button>
            </div>
          </div>
        );
        const target = targets.find(t => t.id === adjustment.condition?.targetId);
        const condition = adjustment.condition;
        const chooseTarget = (id: string) => update(index, {
          category: getConditionBillingCategory(targets.find(t => t.id === id)),
          condition: { targetId: id, operator: 'active' },
        });
        const setCondition = (changes: Partial<AdjustmentCondition>) => update(index, { condition: { targetId: condition?.targetId || '', operator: condition?.operator || 'active', ...changes } });
        const path = target?.path || [];
        const levels = Array.from({ length: path.length + 1 }, (_, depth) => {
          const parent = path.slice(0, depth);
          const children = [...new Set(targets.filter(t => t.path.length > depth && parent.every((v, i) => t.path[i] === v)).map(t => t.path[depth]))];
          if (!children.length) return null;
          const parentTarget = targets.find(t => t.path.length === depth && parent.every((v, i) => t.path[i] === v));
          return (
            <label className="pricing-field" key={`${depth}-${parent.join('/')}`}>
              <span>{depth === 0 ? 'Designer Category' : depth === 1 ? 'Subcategory' : `Condition Detail ${depth}`}</span>
              <select aria-label={depth === 0 ? 'Designer Category' : depth === 1 ? 'Subcategory' : `Condition Detail ${depth}`} value={path[depth] || ''} onChange={event => {
                if (!event.target.value) { chooseTarget(parentTarget?.id || ''); return; }
                const nextPath = [...parent, event.target.value];
                const next = targets.find(t => t.path.length === nextPath.length && nextPath.every((v, i) => t.path[i] === v));
                chooseTarget(next?.id || '');
              }}>
                <option value="">{depth === 0 ? 'Choose a category...' : `Any active ${parent[parent.length - 1]} work`}</option>
                {children.map(label => <option key={label} value={label}>{label}</option>)}
              </select>
            </label>
          );
        });
        return (
          <fieldset className="category-adjustment-card" disabled={disabled} key={adjustment.id}>
            <legend>Adjustment {index + 1}</legend>
            <div className="category-adjustment-fields">
              <label className="pricing-field"><span>Title</span><input value={adjustment.title} onChange={e => update(index, { title: e.target.value })} /></label>
              <label className="pricing-field"><span>Cost ($)</span><input type="number" step="0.01" value={Number.isFinite(adjustment.amount) ? adjustment.amount : ''} onChange={e => update(index, { amount: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
              {adjustment.mode === 'conditional' ? levels[0] : <label className="pricing-field"><span>Breakdown Category</span><select aria-label="Breakdown Category" value={adjustment.category} onChange={e => update(index, { category: e.target.value as CategoryAdjustment['category'] })}>
                <option value="">Choose a category...</option>
                {CATEGORY_ADJUSTMENT_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></label>}
              <div className="category-adjustment-toggles">
                <div className="category-adjustment-switch" role="group" aria-label="Application mode">{(['static', 'conditional'] as const).map(mode => <button type="button" key={mode} aria-pressed={adjustment.mode === mode} onClick={() => {
                  if (adjustment.mode !== mode) update(index, { mode, category: '', condition: undefined });
                }}>{mode === 'static' ? 'Static' : 'Conditional'}</button>)}</div>
                <div className="category-adjustment-switch" role="group" aria-label="Pricing basis">{(['cogs', 'retail'] as const).map(basis => <button type="button" key={basis} aria-pressed={adjustment.basis === basis} onClick={() => update(index, { basis })}>{basis === 'cogs' ? 'COGS' : 'Retail'}</button>)}</div>
              </div>
            </div>
            {adjustment.mode === 'conditional' && <div className="category-adjustment-condition">
              {levels.slice(1)}
              {target?.kind === 'number' && <>
                <label className="pricing-field"><span>Comparison</span><select aria-label="Comparison" value={condition?.operator === 'active' ? 'gt' : condition?.operator} onChange={e => setCondition({ operator: e.target.value as AdjustmentCondition['operator'], value: typeof condition?.value === 'number' ? condition.value : 0 })}>{NUMERIC_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                <label className="pricing-field"><span>{`Value${target.unit ? ` (${target.unit})` : ''}`}</span><input type="number" step="any" value={condition?.operator === 'active' ? 0 : condition?.value ?? ''} onChange={e => setCondition({ operator: condition?.operator === 'active' ? 'gt' : condition?.operator, value: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
              </>}
              {target?.kind === 'choice' && <label className="pricing-field"><span>Matching Option</span><select aria-label="Matching Option" value={condition?.operator === 'equals' ? String(condition.value) : ''} onChange={e => setCondition(e.target.value ? { operator: 'equals', value: e.target.value } : { operator: 'active', value: undefined })}>
                <option value="">Any selected option</option>
                {condition?.operator === 'equals' && !target.choices?.some(o => o.value === condition.value) && <option value={String(condition.value)}>Unavailable saved option — choose a replacement</option>}
                {target.choices?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>}
              {conditionError(condition, targets) && <p role="alert">{conditionError(condition, targets)}</p>}
            </div>}
            <p className="category-adjustment-explanation" aria-live="polite">{explanation}</p>
            {rowError && attemptedSaveIds.has(adjustment.id) && <p className="category-adjustment-error" role="alert">{rowError}</p>}
            <div className="category-adjustment-actions">
              <button type="button" className="category-adjustment-save" onClick={() => {
                if (rowError) {
                  setAttemptedSaveIds(ids => new Set([...ids, adjustment.id]));
                  return;
                }
                if (adjustment.mode === 'conditional') update(index, { category: getConditionBillingCategory(target) });
                setEditingIds(ids => new Set([...ids].filter(id => id !== adjustment.id)));
                setAttemptedSaveIds(ids => new Set([...ids].filter(id => id !== adjustment.id)));
              }}>Save Adjustment</button>
              <button type="button" className="category-adjustment-remove" onClick={() => remove(index)}>Remove adjustment</button>
            </div>
          </fieldset>
        );
      })}
      <button type="button" className="pricing-add-button" disabled={disabled} onClick={() => {
        const id = crypto.randomUUID();
        onChange([...adjustments, { id, title: '', amount: 0, category: '', basis: 'cogs', mode: 'static' }]);
        edit(id);
      }}>Add Category Adjustment</button>
    </div>
  );
}
