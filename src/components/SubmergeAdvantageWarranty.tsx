import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Proposal } from '../types/proposal-new';
import type { WarrantySection, WarrantySectionIcon } from '../types/warranty';
import FranchiseLogo from './FranchiseLogo';
import { useFranchiseAppName } from '../hooks/useFranchiseAppName';
import './SubmergeAdvantageWarranty.css';
import {
  createEmptyWarrantyAdvantageItem,
  createEmptyWarrantyFeatureItem,
  createEmptyWarrantySection,
  normalizeWarrantySections,
  resolveWarrantySections,
} from '../utils/warranty';

type FocusTarget =
  | { type: 'section-title'; sectionId: string }
  | { type: 'feature-label'; sectionId: string; itemId: string }
  | { type: 'advantage'; sectionId: string; itemId: string };

type ContextMenuState =
  | { x: number; y: number; type: 'sheet' }
  | { x: number; y: number; type: 'section'; sectionId: string }
  | { x: number; y: number; type: 'advantage-column'; sectionId: string }
  | { x: number; y: number; type: 'feature'; sectionId: string; itemId: string }
  | { x: number; y: number; type: 'advantage'; sectionId: string; itemId: string };

interface InlineEditableTextProps {
  value: string | undefined;
  placeholder: string;
  editable: boolean;
  multiline?: boolean;
  className: string;
  inputClassName?: string;
  autoEdit?: boolean;
  onAutoEditHandled?: () => void;
  onChange: (value: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  onMouseDown?: (event: ReactMouseEvent<HTMLElement>) => void;
}

const sectionIconMap: Record<WarrantySectionIcon, JSX.Element> = {
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

function InlineEditableText({
  value,
  placeholder,
  editable,
  multiline = false,
  className,
  inputClassName,
  autoEdit = false,
  onAutoEditHandled,
  onChange,
  onContextMenu,
  onMouseDown,
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const displayValue = value ?? '';

  useEffect(() => {
    if (!autoEdit) return;
    setIsEditing(true);
    onAutoEditHandled?.();
  }, [autoEdit, onAutoEditHandled]);

  useEffect(() => {
    if (!isEditing || !inputRef.current) return;
    inputRef.current.focus();
    const length = inputRef.current.value.length;
    inputRef.current.setSelectionRange?.(length, length);
  }, [isEditing]);

  if (!editable) {
    return <div className={className}>{displayValue}</div>;
  }

  if (isEditing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as any}
          className={`warranty-inline-input ${className} ${inputClassName || ''}`}
          rows={1}
          value={displayValue}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setIsEditing(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              setIsEditing(false);
            }
          }}
          onMouseDownCapture={onMouseDown}
          onContextMenuCapture={onContextMenu}
          onContextMenu={onContextMenu}
        />
      );
    }

    return (
      <input
        ref={inputRef as any}
        className={`warranty-inline-input ${className} ${inputClassName || ''}`}
        type="text"
        value={displayValue}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setIsEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            setIsEditing(false);
          }
        }}
        onMouseDownCapture={onMouseDown}
        onContextMenuCapture={onContextMenu}
        onContextMenu={onContextMenu}
      />
    );
  }

    return (
      <button
        type="button"
        className={`warranty-editable ${className} ${displayValue ? '' : 'is-placeholder'}`}
        onClick={(event) => {
          if (event.ctrlKey) return;
          setIsEditing(true);
        }}
        onMouseDownCapture={onMouseDown}
        onMouseDown={onMouseDown}
        onContextMenuCapture={onContextMenu}
        onContextMenu={onContextMenu}
      >
        {displayValue || placeholder}
      </button>
    );
}

const SectionIcon = ({ name }: { name: WarrantySectionIcon }) => (
  <span className="warranty-title-icon">{sectionIconMap[name]}</span>
);

interface Props {
  proposal?: Partial<Proposal>;
  editable?: boolean;
  onWarrantySectionsChange?: (sections: Proposal['warrantySections']) => void;
}

function SubmergeAdvantageWarranty({ proposal, editable = false, onWarrantySectionsChange }: Props) {
  const customerName = (proposal?.customerInfo?.customerName || '').trim();
  const franchiseId = proposal?.franchiseId;
  const { displayName } = useFranchiseAppName(franchiseId);
  const resolvedSections = useMemo(
    () => resolveWarrantySections(proposal, displayName),
    [displayName, proposal]
  );
  const [draftSections, setDraftSections] = useState<WarrantySection[]>(resolvedSections);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);

  useEffect(() => {
    setDraftSections(resolvedSections);
  }, [resolvedSections]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.warranty-context-menu')) return;
      setContextMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('pointerdown', handleClose, true);
    window.addEventListener('contextmenu', handleClose, true);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handleClose, true);
      window.removeEventListener('contextmenu', handleClose, true);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  const sections = editable ? draftSections : resolvedSections;

  const applySections = (updater: (sections: WarrantySection[]) => WarrantySection[]) => {
    if (!editable || !onWarrantySectionsChange) return;
    setDraftSections((prev) => {
      const next = normalizeWarrantySections(updater(prev));
      onWarrantySectionsChange(next);
      return next;
    });
  };

  const clearFocusTarget = () => setFocusTarget(null);

  const updateSectionTitle = (sectionId: string, title: string) => {
    applySections((prev) =>
      prev.map((section) => (section.id === sectionId ? { ...section, title } : section))
    );
  };

  const updateFeatureLabel = (sectionId: string, itemId: string, label: string) => {
    applySections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              featureItems: section.featureItems.map((item) =>
                item.id === itemId ? { ...item, label } : item
              ),
            }
          : section
      )
    );
  };

  const updateFeatureDetail = (sectionId: string, itemId: string, detail: string) => {
    applySections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              featureItems: section.featureItems.map((item) =>
                item.id === itemId ? { ...item, detail } : item
              ),
            }
          : section
      )
    );
  };

  const updateAdvantageText = (sectionId: string, itemId: string, text: string) => {
    applySections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              advantageItems: section.advantageItems.map((item) =>
                item.id === itemId ? { ...item, text } : item
              ),
            }
          : section
      )
    );
  };

  const getInsertIndex = (
    section: WarrantySection,
    target: Extract<ContextMenuState, { sectionId: string }>
  ) => {
    if (target.type === 'feature') {
      const index = section.featureItems.findIndex((item) => item.id === target.itemId);
      return index >= 0 ? index + 1 : section.featureItems.length;
    }
    if (target.type === 'advantage') {
      const index = section.advantageItems.findIndex((item) => item.id === target.itemId);
      return index >= 0 ? index + 1 : section.advantageItems.length;
    }
    return Math.max(section.featureItems.length, section.advantageItems.length);
  };

  const handleAddLineItem = (target: Extract<ContextMenuState, { sectionId: string }>) => {
    let nextFocus: FocusTarget | null = null;
    applySections((prev) =>
      prev.map((section) => {
        if (section.id !== target.sectionId) return section;
        const insertIndex = getInsertIndex(section, target);
        const newFeature = createEmptyWarrantyFeatureItem();
        const newAdvantage = createEmptyWarrantyAdvantageItem();
        nextFocus =
          target.type === 'advantage'
            ? { type: 'advantage', sectionId: section.id || '', itemId: newAdvantage.id || '' }
            : { type: 'feature-label', sectionId: section.id || '', itemId: newFeature.id || '' };
        return {
          ...section,
          featureItems: [
            ...section.featureItems.slice(0, insertIndex),
            newFeature,
            ...section.featureItems.slice(insertIndex),
          ],
          advantageItems: [
            ...section.advantageItems.slice(0, insertIndex),
            newAdvantage,
            ...section.advantageItems.slice(insertIndex),
          ],
        };
      })
    );
    setContextMenu(null);
    if (nextFocus) setFocusTarget(nextFocus);
  };

  const handleRemoveFeatureItem = (sectionId: string, itemId: string) => {
    applySections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              featureItems: section.featureItems.filter((item) => item.id !== itemId),
            }
          : section
      )
    );
    setContextMenu(null);
  };

  const handleRemoveAdvantageItem = (sectionId: string, itemId: string) => {
    applySections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              advantageItems: section.advantageItems.filter((item) => item.id !== itemId),
            }
          : section
      )
    );
    setContextMenu(null);
  };

  const handleAddAdvantageItem = (sectionId: string) => {
    const newAdvantage = createEmptyWarrantyAdvantageItem();
    applySections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              advantageItems: [...section.advantageItems, newAdvantage],
            }
          : section
      )
    );
    setContextMenu(null);
    setFocusTarget({ type: 'advantage', sectionId, itemId: newAdvantage.id || '' });
  };

  const handleAddCategoryBelow = (sectionId: string) => {
    const nextSection = createEmptyWarrantySection();
    applySections((prev) => {
      const currentIndex = prev.findIndex((section) => section.id === sectionId);
      if (currentIndex < 0) return [...prev, nextSection];
      return [...prev.slice(0, currentIndex + 1), nextSection, ...prev.slice(currentIndex + 1)];
    });
    setContextMenu(null);
    setFocusTarget({ type: 'section-title', sectionId: nextSection.id || '' });
  };

  const handleAddCategoryToEnd = () => {
    const nextSection = createEmptyWarrantySection();
    applySections((prev) => [...prev, nextSection]);
    setContextMenu(null);
    setFocusTarget({ type: 'section-title', sectionId: nextSection.id || '' });
  };

  const handleRemoveCategory = (sectionId: string) => {
    applySections((prev) => prev.filter((section) => section.id !== sectionId));
    setContextMenu(null);
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLElement>, nextMenu: ContextMenuState) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu(nextMenu);
  };

  const openContextMenuOnMouseDown = (
    event: ReactMouseEvent<HTMLElement>,
    nextMenu: ContextMenuState
  ) => {
    if (!editable) return;
    if (event.button !== 2 && !event.ctrlKey) return;
    openContextMenu(event, nextMenu);
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;

    if (contextMenu.type === 'sheet') {
      return createPortal(
        <div className="warranty-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={handleAddCategoryToEnd}>
            Add Category
          </button>
        </div>,
        document.body
      );
    }

    if (contextMenu.type === 'section') {
      return createPortal(
        <div className="warranty-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => handleAddLineItem(contextMenu)}>
            Add Line Item
          </button>
          <button type="button" onClick={() => handleAddCategoryBelow(contextMenu.sectionId)}>
            Add Category Below
          </button>
          <button type="button" className="danger" onClick={() => handleRemoveCategory(contextMenu.sectionId)}>
            Remove Category
          </button>
        </div>,
        document.body
      );
    }

    if (contextMenu.type === 'advantage-column') {
      return createPortal(
        <div className="warranty-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => handleAddAdvantageItem(contextMenu.sectionId)}>
            Add Line Item
          </button>
        </div>,
        document.body
      );
    }

    if (contextMenu.type === 'feature') {
      return createPortal(
        <div className="warranty-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => handleAddLineItem(contextMenu)}>
            Add Line Item Below
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => handleRemoveFeatureItem(contextMenu.sectionId, contextMenu.itemId)}
          >
            Remove Category Line Item
          </button>
        </div>,
        document.body
      );
    }

    return createPortal(
      <div className="warranty-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
        <button type="button" onClick={() => handleAddLineItem(contextMenu)}>
          Add Line Item Below
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => handleRemoveAdvantageItem(contextMenu.sectionId, contextMenu.itemId)}
        >
          Remove Warranty Advantage
        </button>
      </div>,
      document.body
    );
  };

  return (
    <div className={`warranty-sheet ${editable ? 'is-editable' : ''}`}>
      <div className="warranty-header">
        <div>
          <p className="warranty-eyebrow">Warranty & Inclusions Overview</p>
          <h2>Warranty & Inclusions</h2>
          <p className="warranty-subtitle">
            Prepared for: <span className="warranty-customer">{customerName || 'N/A'}</span>
          </p>
          {editable && (
            <p className="warranty-edit-hint">
              Click text to edit. Right-click category titles, line items, or empty advantage space to add or remove entries.
            </p>
          )}
        </div>
        <div className="warranty-logo">
          <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseId} />
        </div>
      </div>

      <div className="warranty-section-stack">
        {!sections.length && (
          <div
            className="warranty-section"
            onContextMenu={(event) =>
              openContextMenu(event, {
                x: event.clientX,
                y: event.clientY,
                type: 'sheet',
              })
            }
          >
            <div className="warranty-section-card">
              <div className="warranty-advantage-card muted">
                No warranty categories configured.
                {editable ? ' Right-click here to add one.' : ''}
              </div>
            </div>
          </div>
        )}
        {sections.map((section) => (
          <div key={section.id || section.title} className="warranty-section">
            <div className="warranty-section-card">
              <div className="warranty-section-heading">
                <div
                  className="warranty-title-wrap"
                  onMouseDown={(event) =>
                    openContextMenuOnMouseDown(event, {
                      x: event.clientX,
                      y: event.clientY,
                      type: 'section',
                      sectionId: section.id || '',
                    })
                  }
                  onContextMenu={(event) =>
                    openContextMenu(event, {
                      x: event.clientX,
                      y: event.clientY,
                      type: 'section',
                      sectionId: section.id || '',
                    })
                  }
                >
                  <SectionIcon name={section.icon} />
                  <InlineEditableText
                    value={section.title}
                    placeholder="New category"
                    editable={editable}
                    className="warranty-section-title"
                    onChange={(value) => updateSectionTitle(section.id || '', value)}
                    autoEdit={
                      focusTarget?.type === 'section-title' && focusTarget.sectionId === (section.id || '')
                    }
                    onAutoEditHandled={clearFocusTarget}
                    onMouseDown={(event) =>
                      openContextMenuOnMouseDown(event, {
                        x: event.clientX,
                        y: event.clientY,
                        type: 'section',
                        sectionId: section.id || '',
                      })
                    }
                  />
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
                  {!section.featureItems.length && (
                    <div className="warranty-empty-column">No category line items. Right-click the category title to add one.</div>
                  )}
                  {section.featureItems.map((item) => (
                    <div
                      key={item.id || item.label}
                      className="warranty-feature"
                      onMouseDown={(event) =>
                        openContextMenuOnMouseDown(event, {
                          x: event.clientX,
                          y: event.clientY,
                          type: 'feature',
                          sectionId: section.id || '',
                          itemId: item.id || '',
                        })
                      }
                      onContextMenu={(event) =>
                        openContextMenu(event, {
                          x: event.clientX,
                          y: event.clientY,
                          type: 'feature',
                          sectionId: section.id || '',
                          itemId: item.id || '',
                        })
                      }
                    >
                      <span className="feature-check" aria-hidden="true" />
                      <div className="feature-copy">
                        <InlineEditableText
                          value={item.label}
                          placeholder="Click to add category line item"
                          editable={editable}
                          multiline
                          className="feature-label"
                          onChange={(value) => updateFeatureLabel(section.id || '', item.id || '', value)}
                          autoEdit={
                            focusTarget?.type === 'feature-label' &&
                            focusTarget.sectionId === (section.id || '') &&
                            focusTarget.itemId === (item.id || '')
                          }
                          onAutoEditHandled={clearFocusTarget}
                          onMouseDown={(event) =>
                            openContextMenuOnMouseDown(event, {
                              x: event.clientX,
                              y: event.clientY,
                              type: 'feature',
                              sectionId: section.id || '',
                              itemId: item.id || '',
                            })
                          }
                          onContextMenu={(event) =>
                            openContextMenu(event, {
                              x: event.clientX,
                              y: event.clientY,
                              type: 'feature',
                              sectionId: section.id || '',
                              itemId: item.id || '',
                            })
                          }
                        />
                        {item.detail && (
                          <InlineEditableText
                            value={item.detail}
                            placeholder="Optional detail"
                            editable={editable}
                            multiline
                            className="feature-detail"
                            inputClassName="feature-detail"
                            onChange={(value) => updateFeatureDetail(section.id || '', item.id || '', value)}
                            onContextMenu={(event) =>
                              openContextMenu(event, {
                                x: event.clientX,
                                y: event.clientY,
                                type: 'feature',
                                sectionId: section.id || '',
                                itemId: item.id || '',
                              })
                            }
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="warranty-advantage-column"
                  onMouseDown={(event) =>
                    openContextMenuOnMouseDown(event, {
                      x: event.clientX,
                      y: event.clientY,
                      type: 'advantage-column',
                      sectionId: section.id || '',
                    })
                  }
                  onContextMenu={(event) =>
                    openContextMenu(event, {
                      x: event.clientX,
                      y: event.clientY,
                      type: 'advantage-column',
                      sectionId: section.id || '',
                    })
                  }
                >
                  {!section.advantageItems.length && (
                    <div className="warranty-advantage-card muted">
                      No warranty advantages listed. Right-click here to add one.
                    </div>
                  )}
                  {section.advantageItems.map((item) => (
                    <InlineEditableText
                      key={item.id || item.text}
                      value={item.text}
                      placeholder="Click to add warranty advantage"
                      editable={editable}
                      multiline
                      className="warranty-advantage-card"
                      inputClassName="warranty-advantage-card"
                      onChange={(value) => updateAdvantageText(section.id || '', item.id || '', value)}
                      autoEdit={
                        focusTarget?.type === 'advantage' &&
                        focusTarget.sectionId === (section.id || '') &&
                        focusTarget.itemId === (item.id || '')
                      }
                      onAutoEditHandled={clearFocusTarget}
                      onMouseDown={(event) =>
                        openContextMenuOnMouseDown(event, {
                          x: event.clientX,
                          y: event.clientY,
                          type: 'advantage',
                          sectionId: section.id || '',
                          itemId: item.id || '',
                        })
                      }
                      onContextMenu={(event) =>
                        openContextMenu(event, {
                          x: event.clientX,
                          y: event.clientY,
                          type: 'advantage',
                          sectionId: section.id || '',
                          itemId: item.id || '',
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {renderContextMenu()}
    </div>
  );
}

export default SubmergeAdvantageWarranty;
