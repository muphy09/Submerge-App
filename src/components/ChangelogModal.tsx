import { Fragment, useEffect, useLayoutEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { getSessionFranchiseCode, getSessionFranchiseName, getSessionRole } from '../services/session';
import './ChangelogModal.css';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChangelogTab = 'franchise' | 'global';

type ChangelogContent = {
  globalNotes: string;
  franchiseNotes: string;
};

const EMPTY_CHANGELOG: ChangelogContent = {
  globalNotes: '',
  franchiseNotes: '',
};

type ChangelogListItem = {
  text: string;
  level: number;
};

type ChangelogBlock =
  | {
      type: 'divider';
    }
  | {
      type: 'list';
      items: ChangelogListItem[];
    }
  | {
      type: 'paragraph' | 'subheading';
      text: string;
    };

type ChangelogSection = {
  key: string;
  title: string;
  blocks: ChangelogBlock[];
};

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return segments.map((segment, index) => {
    const key = `${keyPrefix}-${index}`;

    if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
      return <strong key={key}>{segment.slice(2, -2)}</strong>;
    }

    if (segment.startsWith('*') && segment.endsWith('*') && segment.length > 2) {
      return <em key={key}>{segment.slice(1, -1)}</em>;
    }

    return <Fragment key={key}>{segment}</Fragment>;
  });
}

function renderNestedList(items: ChangelogListItem[], keyPrefix: string, startIndex = 0): ReactNode {
  const result: ReactNode[] = [];
  let i = startIndex;

  while (i < items.length) {
    const currentItem = items[i];
    const currentLevel = currentItem.level;
    const children: ChangelogListItem[] = [];
    let j = i + 1;

    while (j < items.length && items[j].level > currentLevel) {
      children.push(items[j]);
      j++;
    }

    result.push(
      <li key={`${keyPrefix}-item-${i}`}>
        {renderInlineMarkdown(currentItem.text, `${keyPrefix}-text-${i}`)}
        {children.length > 0 && (
          <ul className="patch-notes-list patch-notes-list--nested">
            {renderNestedList(children, `${keyPrefix}-nested-${i}`)}
          </ul>
        )}
      </li>
    );

    i = j;
  }

  return result;
}

function renderBlocks(blocks: ChangelogBlock[], keyPrefix: string) {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}-${index}`;

    if (block.type === 'divider') {
      return <div key={key} className="patch-notes-divider" />;
    }

    if (block.type === 'list') {
      return (
        <ul key={key} className="patch-notes-list">
          {renderNestedList(block.items, `${key}-list`)}
        </ul>
      );
    }

    if (block.type === 'subheading') {
      return (
        <h4 key={key} className="patch-notes-subheading">
          {renderInlineMarkdown(block.text, `${key}-subheading`)}
        </h4>
      );
    }

    return (
      <p key={key} className="patch-notes-paragraph">
        {renderInlineMarkdown(block.text, `${key}-paragraph`)}
      </p>
    );
  });
}

function parseChangelog(content: string) {
  const lines = content.split(/\r?\n/);
  const introBlocks: ChangelogBlock[] = [];
  const sections: ChangelogSection[] = [];
  let currentBlocks = introBlocks;
  let listItems: ChangelogListItem[] = [];
  let lastWasDivider = false;

  const trimTrailingDividers = (blocks: ChangelogBlock[]) => {
    while (blocks[blocks.length - 1]?.type === 'divider') {
      blocks.pop();
    }
  };

  const flushList = () => {
    if (!listItems.length) return;

    currentBlocks.push({
      type: 'list',
      items: listItems,
    });
    lastWasDivider = false;
    listItems = [];
  };

  const pushBlock = (block: ChangelogBlock) => {
    if (block.type === 'divider') {
      if (!currentBlocks.length || lastWasDivider) {
        return;
      }
    }

    currentBlocks.push(block);
    lastWasDivider = block.type === 'divider';
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    const versionHeadingMatch = trimmed.match(/^##\s+(\[[^\]]+\].*)$/);
    if (versionHeadingMatch) {
      flushList();
      trimTrailingDividers(currentBlocks);

      const nextSection: ChangelogSection = {
        key: `section-${sections.length}-${index}`,
        title: versionHeadingMatch[1],
        blocks: [],
      };

      sections.push(nextSection);
      currentBlocks = nextSection.blocks;
      lastWasDivider = false;
      return;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushList();
      pushBlock({ type: 'divider' });
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      pushBlock({
        type: 'subheading',
        text: trimmed.replace(/^###\s*/, ''),
      });
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList();
      pushBlock({
        type: 'subheading',
        text: trimmed.replace(/^##\s*/, ''),
      });
      return;
    }

    if (trimmed.startsWith('- ')) {
      const leadingSpaces = line.length - line.trimStart().length;
      listItems.push({
        text: trimmed.replace(/^-\s*/, ''),
        level: Math.floor(leadingSpaces / 4),
      });
      lastWasDivider = false;
      return;
    }

    flushList();
    pushBlock({
      type: 'paragraph',
      text: trimmed,
    });
  });

  flushList();
  trimTrailingDividers(introBlocks);
  sections.forEach((section) => trimTrailingDividers(section.blocks));

  return {
    introBlocks,
    sections,
  };
}

function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
  const [content, setContent] = useState<ChangelogContent>(EMPTY_CHANGELOG);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ChangelogTab>('franchise');
  const [expandedSectionIndex, setExpandedSectionIndex] = useState<number | null>(0);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadChangelog = async () => {
      setLoading(true);
      setError('');
      setContent(EMPTY_CHANGELOG);

      if (!window.electron?.readChangelog) {
        if (cancelled) return;
        setError('Changelog is unavailable in this environment.');
        setLoading(false);
        return;
      }

      try {
        const nextContent = await window.electron.readChangelog({
          role: getSessionRole(),
          franchiseCode: getSessionFranchiseCode(),
        });
        if (cancelled) return;
        setContent({
          globalNotes: String(nextContent?.globalNotes || ''),
          franchiseNotes: String(nextContent?.franchiseNotes || ''),
        });
      } catch (loadError) {
        console.error('Failed to load changelog:', loadError);
        if (cancelled) return;
        setError('Unable to load the changelog right now.');
        setContent(EMPTY_CHANGELOG);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadChangelog();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    setActiveTab('franchise');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setExpandedSectionIndex(0);
  }, [activeTab, content, isOpen]);

  if (!isOpen) return null;

  const sessionRole = getSessionRole();
  const canViewGlobalNotes = sessionRole === 'admin' || sessionRole === 'owner' || sessionRole === 'master';
  const franchiseName = String(getSessionFranchiseName() || '').trim();
  const franchiseCode = String(getSessionFranchiseCode() || '').trim();
  const franchiseTabLabel = franchiseName || (sessionRole === 'master' ? 'All Franchises' : franchiseCode || 'Franchise');
  const activeContent = activeTab === 'franchise' ? content.franchiseNotes : content.globalNotes;
  const { introBlocks, sections } = parseChangelog(activeContent);
  const hasContent = Boolean(activeContent.trim());

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="patch-notes-backdrop" onClick={handleBackdropClick}>
      <div
        className="patch-notes-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patch-notes-title"
      >
        <div className="patch-notes-header">
          <h2 id="patch-notes-title" className="patch-notes-title">
            Patch Notes
          </h2>
          <button
            type="button"
            className="patch-notes-close-button"
            onClick={onClose}
            aria-label="Close patch notes"
          >
            X
          </button>
        </div>
        <div className="patch-notes-tabs" role="tablist" aria-label="Patch note categories">
          <button
            type="button"
            id="patch-notes-franchise-tab"
            className={`patch-notes-tab${activeTab === 'franchise' ? ' patch-notes-tab--active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'franchise'}
            aria-controls="patch-notes-tab-panel"
            tabIndex={activeTab === 'franchise' ? 0 : -1}
            onClick={() => setActiveTab('franchise')}
          >
            {franchiseTabLabel}
          </button>
          {canViewGlobalNotes && (
            <button
              type="button"
              id="patch-notes-global-tab"
              className={`patch-notes-tab${activeTab === 'global' ? ' patch-notes-tab--active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'global'}
              aria-controls="patch-notes-tab-panel"
              tabIndex={activeTab === 'global' ? 0 : -1}
              onClick={() => setActiveTab('global')}
            >
              Global
            </button>
          )}
        </div>
        <div
          id="patch-notes-tab-panel"
          className="patch-notes-body"
          role="tabpanel"
          aria-labelledby={activeTab === 'franchise' ? 'patch-notes-franchise-tab' : 'patch-notes-global-tab'}
        >
          {loading && <p className="patch-notes-status">Loading changelog...</p>}
          {!loading && error && <p className="patch-notes-error">{error}</p>}
          {!loading && !error && !hasContent && (
            <p className="patch-notes-empty">
              {activeTab === 'franchise'
                ? `No patch notes have been published for ${franchiseTabLabel} yet.`
                : 'No global patch notes have been published yet.'}
            </p>
          )}
          {!loading && !error && hasContent && (
            <div className="patch-notes-content">
              {sections.length > 0 ? (
                <>
                  {introBlocks.length > 0 && (
                    <div className="patch-notes-standalone">{renderBlocks(introBlocks, 'patch-notes-intro')}</div>
                  )}
                  <div className="patch-notes-sections">
                    {sections.map((section, index) => {
                      const isExpanded = expandedSectionIndex === index;
                      const buttonId = `patch-notes-section-button-${index}`;
                      const panelId = `patch-notes-section-panel-${index}`;

                      return (
                        <section
                          key={section.key}
                          className={`patch-notes-section${isExpanded ? ' patch-notes-section--expanded' : ''}`}
                        >
                          <button
                            type="button"
                            id={buttonId}
                            className="patch-notes-section-toggle"
                            onClick={() => setExpandedSectionIndex((currentIndex) => (currentIndex === index ? null : index))}
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                          >
                            <span className="patch-notes-section-title">
                              {renderInlineMarkdown(section.title, `${section.key}-title`)}
                            </span>
                            <span className="patch-notes-section-icon" aria-hidden="true" />
                          </button>
                          {isExpanded && (
                            <div
                              id={panelId}
                              className="patch-notes-section-panel"
                              role="region"
                              aria-labelledby={buttonId}
                            >
                              {renderBlocks(section.blocks, section.key)}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </>
              ) : (
                renderBlocks(introBlocks, 'patch-notes-content')
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChangelogModal;
