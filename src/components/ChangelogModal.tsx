import { useEffect, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import './ChangelogModal.css';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ChangelogListItem = {
  text: string;
  level: number;
};

function renderChangelog(content: string) {
  const lines = content.split(/\r?\n/);
  const elements: ReactNode[] = [];
  let listItems: ChangelogListItem[] = [];
  let hasContent = false;
  let lastWasDivider = false;

  const flushList = (index: number) => {
    if (!listItems.length) return;

    const renderNestedList = (items: ChangelogListItem[], startIndex = 0): ReactNode => {
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
          <li key={`item-${i}`}>
            {currentItem.text}
            {children.length > 0 && <ul className="patch-notes-list patch-notes-list--nested">{renderNestedList(children, 0)}</ul>}
          </li>
        );

        i = j;
      }

      return result;
    };

    elements.push(
      <ul key={`list-${index}`} className="patch-notes-list">
        {renderNestedList(listItems)}
      </ul>
    );
    hasContent = true;
    lastWasDivider = false;
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(index);
      return;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushList(index);
      if (hasContent) {
        elements.push(<div key={`divider-${index}`} className="patch-notes-divider" />);
        lastWasDivider = true;
      }
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(index);
      elements.push(
        <h3 key={`heading-${index}`} className="patch-notes-heading">
          {trimmed.replace(/^##\s*/, '')}
        </h3>
      );
      hasContent = true;
      lastWasDivider = false;
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(index);
      elements.push(
        <h4 key={`subheading-${index}`} className="patch-notes-subheading">
          {trimmed.replace(/^###\s*/, '')}
        </h4>
      );
      hasContent = true;
      lastWasDivider = false;
      return;
    }

    if (trimmed.startsWith('- ')) {
      const leadingSpaces = line.length - line.trimStart().length;
      listItems.push({
        text: trimmed.replace(/^-\s*/, ''),
        level: Math.floor(leadingSpaces / 4),
      });
      hasContent = true;
      lastWasDivider = false;
      return;
    }

    flushList(index);
    elements.push(
      <p key={`paragraph-${index}`} className="patch-notes-paragraph">
        {trimmed}
      </p>
    );
    hasContent = true;
    lastWasDivider = false;
  });

  flushList(lines.length);

  if (lastWasDivider) {
    elements.pop();
  }

  return elements;
}

function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadChangelog = async () => {
      setLoading(true);
      setError('');
      setContent('');

      if (!window.electron?.readChangelog) {
        if (cancelled) return;
        setError('Changelog is unavailable in this environment.');
        setLoading(false);
        return;
      }

      try {
        const nextContent = await window.electron.readChangelog();
        if (cancelled) return;
        setContent(nextContent);
      } catch (loadError) {
        console.error('Failed to load changelog:', loadError);
        if (cancelled) return;
        setError('Unable to load the changelog right now.');
        setContent('');
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

  if (!isOpen) return null;

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
        <div className="patch-notes-body">
          {loading && <p className="patch-notes-status">Loading changelog...</p>}
          {!loading && error && <p className="patch-notes-error">{error}</p>}
          {!loading && !error && <div className="patch-notes-content">{renderChangelog(content)}</div>}
        </div>
      </div>
    </div>
  );
}

export default ChangelogModal;
