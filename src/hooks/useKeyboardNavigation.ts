import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const NAV_HIGHLIGHT_CLASS = 'kbd-nav-selected';
const NAV_CONTAINER_SELECTORS = ['.navigation-bar', '.section-nav'];
const MAIN_EXCLUDE_SELECTORS = ['.sidebar-toggle', '.sidebar-show-button'];
const MODAL_SCOPE_SELECTORS = [
  '[aria-modal="true"]',
  '.login-modal',
  '.pricing-modal',
  '.settings-modal',
  '.changelog-modal',
  '.confirm-modal',
  '.cost-modal-content',
  '.cost-breakdown-page-container',
  '.modal-content',
];

const isElementVisible = (element: HTMLElement) => {
  if (!element.isConnected) return false;
  if (element.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const isElementInViewport = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
};

const getActiveScopeRoot = () => {
  const selector = MODAL_SCOPE_SELECTORS.join(',');
  const modals = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isElementVisible);
  return modals.length > 0 ? modals[modals.length - 1] : document.body;
};

const getFocusableElements = (scope: ParentNode) =>
  Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isElementVisible);

const isInNavContainer = (element: HTMLElement) =>
  NAV_CONTAINER_SELECTORS.some((selector) => Boolean(element.closest(selector)));

const isExcludedFromMain = (element: HTMLElement) =>
  MAIN_EXCLUDE_SELECTORS.some((selector) => Boolean(element.closest(selector)));

const getScrollContainer = (element: HTMLElement) => {
  let current = element.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const canScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && current.scrollHeight > current.clientHeight;
    const canScrollX = (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay')
      && current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) {
      return current;
    }
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
};

const getMainCandidates = () => {
  const scope = getActiveScopeRoot();
  return getFocusableElements(scope).filter(
    (element) => !isInNavContainer(element) && !isExcludedFromMain(element)
  );
};

const getNavCandidates = () => {
  const scope = getActiveScopeRoot();
  if (scope !== document.body) {
    return [];
  }

  const leftNavItems = Array.from(document.querySelectorAll<HTMLElement>('.section-nav .nav-item')).filter(isElementVisible);
  if (leftNavItems.length > 0) {
    return leftNavItems;
  }

  return Array.from(document.querySelectorAll<HTMLElement>('.navigation-bar .nav-link')).filter(isElementVisible);
};

type PositionedElement = {
  element: HTMLElement;
  centerX: number;
  centerY: number;
  height: number;
  left: number;
};

type Row = {
  elements: PositionedElement[];
  centerY: number;
};

const getMedian = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const getDocumentOffset = (element: HTMLElement) => {
  let top = 0;
  let left = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    left += current.offsetLeft;
    current = current.offsetParent as HTMLElement | null;
  }
  return { top, left };
};

const getOffsetRelativeToContainer = (element: HTMLElement, container: HTMLElement) => {
  const elementOffset = getDocumentOffset(element);
  const containerOffset = getDocumentOffset(container);
  return {
    top: elementOffset.top - containerOffset.top,
    left: elementOffset.left - containerOffset.left,
  };
};

const getContainerScale = (container: HTMLElement) => {
  const rect = container.getBoundingClientRect();
  const scaleX = container.offsetWidth ? rect.width / container.offsetWidth : 1;
  const scaleY = container.offsetHeight ? rect.height / container.offsetHeight : 1;
  return { scaleX, scaleY };
};

const buildRows = (elements: HTMLElement[], container: HTMLElement) => {
  const containerRect = container.getBoundingClientRect();
  const containerScale = getContainerScale(container);
  const positions: PositionedElement[] = elements.map((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const isSticky = style.position === 'sticky';
    let left = rect.left - containerRect.left + container.scrollLeft;
    let top = rect.top - containerRect.top + container.scrollTop;

    if (isSticky) {
      const offset = getOffsetRelativeToContainer(element, container);
      left = offset.left * containerScale.scaleX;
      top = offset.top * containerScale.scaleY;
    }

    return {
      element,
      centerX: left + rect.width / 2,
      centerY: top + rect.height / 2,
      height: rect.height,
      left,
    };
  });
  const medianHeight = getMedian(positions.map((pos) => pos.height));
  const rowThreshold = Math.max(8, Math.min(24, medianHeight * 0.6));

  positions.sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);

  const rows: Row[] = [];
  positions.forEach((pos) => {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(pos.centerY - lastRow.centerY) <= rowThreshold) {
      lastRow.elements.push(pos);
      lastRow.centerY =
        (lastRow.centerY * (lastRow.elements.length - 1) + pos.centerY) / lastRow.elements.length;
    } else {
      rows.push({ elements: [pos], centerY: pos.centerY });
    }
  });

  rows.forEach((row) => row.elements.sort((a, b) => a.left - b.left));
  return rows;
};

const buildRowIndexMap = (rows: Row[]) => {
  const map = new Map<HTMLElement, { rowIndex: number; itemIndex: number; centerX: number }>();
  rows.forEach((row, rowIndex) => {
    row.elements.forEach((pos, itemIndex) => {
      map.set(pos.element, { rowIndex, itemIndex, centerX: pos.centerX });
    });
  });
  return map;
};

const findClosestInRow = (row: Row, targetX: number) => {
  let best: PositionedElement | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  row.elements.forEach((pos) => {
    const delta = Math.abs(pos.centerX - targetX);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = pos;
    }
  });
  return best;
};

const findViewportNeighbor = (
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: 'up' | 'down'
) => {
  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;

  let best: { element: HTMLElement; primary: number; perpendicular: number; distance: number } | null = null;
  candidates.forEach((candidate) => {
    if (candidate === current) return;
    const rect = candidate.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = centerX - currentCenterX;
    const dy = centerY - currentCenterY;

    if (direction === 'up' && dy >= 0) return;
    if (direction === 'down' && dy <= 0) return;

    const primary = Math.abs(dy);
    const perpendicular = Math.abs(dx);
    const distance = Math.hypot(dx, dy);

    if (
      !best ||
      primary < best.primary ||
      (primary === best.primary && perpendicular < best.perpendicular) ||
      (primary === best.primary && perpendicular === best.perpendicular && distance < best.distance)
    ) {
      best = { element: candidate, primary, perpendicular, distance };
    }
  });

  return best?.element ?? null;
};

const isArrowKey = (event: KeyboardEvent) => {
  const key = event.key;
  const code = event.code;
  return (
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'Up' ||
    key === 'Down' ||
    key === 'Left' ||
    key === 'Right' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight'
  );
};

const getKeyDirection = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  if (key === 'w' || event.key === 'ArrowUp' || event.key === 'Up' || event.code === 'ArrowUp') return 'up';
  if (key === 's' || event.key === 'ArrowDown' || event.key === 'Down' || event.code === 'ArrowDown') return 'down';
  if (key === 'a' || event.key === 'ArrowLeft' || event.key === 'Left' || event.code === 'ArrowLeft') return 'left';
  if (key === 'd' || event.key === 'ArrowRight' || event.key === 'Right' || event.code === 'ArrowRight') return 'right';
  return null;
};

const stepSelectOption = (select: HTMLSelectElement, delta: number) => {
  const options = Array.from(select.options);
  if (options.length === 0) return;
  let index = select.selectedIndex;
  let nextIndex = index;
  const direction = delta >= 0 ? 1 : -1;

  while (true) {
    nextIndex += direction;
    if (nextIndex < 0 || nextIndex >= options.length) {
      return;
    }
    if (!options[nextIndex].disabled) {
      break;
    }
  }

  if (nextIndex === index) return;
  select.selectedIndex = nextIndex;
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const findListboxOptions = (listbox: HTMLElement) => {
  const options = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]')).filter(isElementVisible);
  if (options.length > 0) return options;
  return Array.from(listbox.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')).filter(
    isElementVisible
  );
};

const findListboxForTrigger = (trigger: HTMLElement) => {
  const scope = getActiveScopeRoot();
  const controlsId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
  if (controlsId) {
    const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(controlsId) : controlsId;
    const controlled = scope.querySelector<HTMLElement>(`#${escapedId}`);
    if (controlled && isElementVisible(controlled)) {
      return controlled;
    }
  }

  const parent = trigger.parentElement;
  if (parent) {
    const localListboxes = Array.from(parent.querySelectorAll<HTMLElement>('[role="listbox"]')).filter(isElementVisible);
    if (localListboxes.length > 0) {
      return localListboxes[localListboxes.length - 1];
    }
  }

  const listboxes = Array.from(scope.querySelectorAll<HTMLElement>('[role="listbox"]')).filter(isElementVisible);
  return listboxes.length > 0 ? listboxes[listboxes.length - 1] : null;
};

const openNativeSelect = (select: HTMLSelectElement) => {
  select.focus();
  if (typeof (select as HTMLSelectElement & { showPicker?: () => void }).showPicker === 'function') {
    try {
      (select as HTMLSelectElement & { showPicker: () => void }).showPicker();
      return;
    } catch {
      // Fallback to click events below.
    }
  }

  const mouseOptions: MouseEventInit = { bubbles: true, cancelable: true, view: window };
  select.dispatchEvent(new MouseEvent('mousedown', mouseOptions));
  select.dispatchEvent(new MouseEvent('mouseup', mouseOptions));
  select.dispatchEvent(new MouseEvent('click', mouseOptions));
};

const alignScrollToEdge = (element: HTMLElement) => {
  const container = getScrollContainer(element);
  const candidates = getMainCandidates().filter(
    (candidate) => getScrollContainer(candidate) === container
  );
  if (candidates.length === 0) return;
  const rows = buildRows(candidates, container);
  if (rows.length === 0) return;
  const ordered = rows.flatMap((row) => row.elements.map((pos) => pos.element));
  if (ordered[0] === element) {
    container.scrollTop = 0;
  }
  if (ordered[ordered.length - 1] === element) {
    container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  }
};

const activateElement = (element: HTMLElement) => {
  if (element instanceof HTMLInputElement) {
    const type = (element.type || '').toLowerCase();
    if (['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(type)) {
      element.click();
      return;
    }
    element.focus();
    return;
  }

  if (element instanceof HTMLTextAreaElement) {
    element.focus();
    return;
  }

  if (element instanceof HTMLSelectElement) {
    element.focus();
    element.click();
    return;
  }

  if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) {
    element.click();
    return;
  }

  element.focus();
  element.click();
};

const isTextEntryElement = (element: HTMLElement) => {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    const type = (element.type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(type);
  }
  return element.isContentEditable;
};

const isSpaceKey = (event: KeyboardEvent) => event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';

const isNavigationKey = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  return (
    key === 'w' ||
    key === 'a' ||
    key === 's' ||
    key === 'd' ||
    key === 'r' ||
    key === 'f' ||
    isArrowKey(event) ||
    isSpaceKey(event)
  );
};

const scrollIntoView = (element: HTMLElement) => {
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

const useKeyboardNavigation = () => {
  const navModeActiveRef = useRef(false);
  const lastMainRef = useRef<HTMLElement | null>(null);
  const lastNavRef = useRef<HTMLElement | null>(null);
  const highlightedMainRef = useRef<HTMLElement | null>(null);
  const highlightedNavRef = useRef<HTMLElement | null>(null);
  const highlightedListboxOptionRef = useRef<HTMLElement | null>(null);
  const navHighlightTimeoutRef = useRef<number | null>(null);
  const selectModeRef = useRef<HTMLSelectElement | null>(null);
  const listboxModeRef = useRef<{ listbox: HTMLElement; options: HTMLElement[]; index: number; trigger?: HTMLElement } | null>(
    null
  );

  const clearHighlights = () => {
    if (highlightedMainRef.current) {
      highlightedMainRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
      highlightedMainRef.current = null;
    }
    if (navHighlightTimeoutRef.current) {
      window.clearTimeout(navHighlightTimeoutRef.current);
      navHighlightTimeoutRef.current = null;
    }
    if (highlightedNavRef.current) {
      highlightedNavRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
      highlightedNavRef.current = null;
    }
    if (highlightedListboxOptionRef.current) {
      highlightedListboxOptionRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
      highlightedListboxOptionRef.current = null;
    }
  };

  const applyMainHighlight = (element: HTMLElement) => {
    if (highlightedMainRef.current && highlightedMainRef.current !== element) {
      highlightedMainRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
    }
    element.classList.add(NAV_HIGHLIGHT_CLASS);
    highlightedMainRef.current = element;
  };

  const showNavHighlight = (element: HTMLElement) => {
    if (navHighlightTimeoutRef.current) {
      window.clearTimeout(navHighlightTimeoutRef.current);
      navHighlightTimeoutRef.current = null;
    }
    if (highlightedNavRef.current && highlightedNavRef.current !== element) {
      highlightedNavRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
    }
    element.classList.add(NAV_HIGHLIGHT_CLASS);
    highlightedNavRef.current = element;
    navHighlightTimeoutRef.current = window.setTimeout(() => {
      if (highlightedNavRef.current === element) {
        element.classList.remove(NAV_HIGHLIGHT_CLASS);
        highlightedNavRef.current = null;
      }
      navHighlightTimeoutRef.current = null;
    }, 2000);
  };

  const setMainSelection = (element: HTMLElement, options?: { alignEdges?: boolean }) => {
    lastMainRef.current = element;
    if (navModeActiveRef.current) {
      applyMainHighlight(element);
      scrollIntoView(element);
      if (options?.alignEdges) {
        alignScrollToEdge(element);
      }
    }
  };

  const setNavSelection = (element: HTMLElement, highlight = false) => {
    lastNavRef.current = element;
    if (highlight) {
      showNavHighlight(element);
      scrollIntoView(element);
    }
  };

  const applyListboxHighlight = (element: HTMLElement) => {
    if (highlightedListboxOptionRef.current && highlightedListboxOptionRef.current !== element) {
      highlightedListboxOptionRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
    }
    element.classList.add(NAV_HIGHLIGHT_CLASS);
    highlightedListboxOptionRef.current = element;
    element.focus();
    element.scrollIntoView({ block: 'nearest' });
  };

  const exitListboxMode = () => {
    const trigger = listboxModeRef.current?.trigger;
    listboxModeRef.current = null;
    if (highlightedListboxOptionRef.current) {
      highlightedListboxOptionRef.current.classList.remove(NAV_HIGHLIGHT_CLASS);
      highlightedListboxOptionRef.current = null;
    }
    if (trigger && isElementVisible(trigger)) {
      setMainSelection(trigger);
    }
  };

  const ensureSelection = (group: 'main' | 'nav') => {
    const candidates = group === 'main' ? getMainCandidates() : getNavCandidates();
    if (candidates.length === 0) {
      return { element: null, wasSet: false };
    }
    const last = group === 'main' ? lastMainRef.current : lastNavRef.current;
    if (last && candidates.includes(last) && isElementVisible(last)) {
      if (navModeActiveRef.current) {
        if (group === 'main') {
          applyMainHighlight(last);
        }
      }
      return { element: last, wasSet: false };
    }
    const first = candidates.find(isElementInViewport) ?? candidates[0];
    if (group === 'main') {
      setMainSelection(first);
    } else {
      setNavSelection(first);
    }
    return { element: first, wasSet: true };
  };

  const moveMain = (direction: 'up' | 'down' | 'left' | 'right') => {
    const candidates = getMainCandidates();
    if (candidates.length === 0) return;
    const { element: current, wasSet } = ensureSelection('main');
    if (!current || wasSet) return;
    const containerCache = new Map<HTMLElement, HTMLElement>();
    const getContainerForCandidate = (element: HTMLElement) => {
      const cached = containerCache.get(element);
      if (cached) return cached;
      const container = getScrollContainer(element);
      containerCache.set(element, container);
      return container;
    };

    const currentContainer = getContainerForCandidate(current);
    const containerCandidates = candidates.filter(
      (element) => getContainerForCandidate(element) === currentContainer
    );
    const rows = buildRows(containerCandidates, currentContainer);
    const indexMap = buildRowIndexMap(rows);
    const currentPosition = indexMap.get(current);
    if (!currentPosition) return;

    const currentRow = rows[currentPosition.rowIndex];
    let next: HTMLElement | null = null;

    if (direction === 'left') {
      if (currentPosition.itemIndex > 0) {
        next = currentRow.elements[currentPosition.itemIndex - 1].element;
      } else if (currentPosition.rowIndex > 0) {
        const prevRow = rows[currentPosition.rowIndex - 1];
        next = prevRow.elements[prevRow.elements.length - 1].element;
      }
    }

    if (direction === 'right') {
      if (currentPosition.itemIndex < currentRow.elements.length - 1) {
        next = currentRow.elements[currentPosition.itemIndex + 1].element;
      } else if (currentPosition.rowIndex < rows.length - 1) {
        const nextRow = rows[currentPosition.rowIndex + 1];
        next = nextRow.elements[0].element;
      }
    }

    if (direction === 'up' && currentPosition.rowIndex > 0) {
      const prevRow = rows[currentPosition.rowIndex - 1];
      const closest = findClosestInRow(prevRow, currentPosition.centerX);
      next = closest?.element ?? null;
    }

    if (direction === 'down' && currentPosition.rowIndex < rows.length - 1) {
      const nextRow = rows[currentPosition.rowIndex + 1];
      const closest = findClosestInRow(nextRow, currentPosition.centerX);
      next = closest?.element ?? null;
    }

    if (!next && (direction === 'up' || direction === 'down')) {
      const otherCandidates = candidates.filter(
        (element) => getContainerForCandidate(element) !== currentContainer
      );
      next = findViewportNeighbor(current, otherCandidates, direction);
    }

    if (next) {
      setMainSelection(next, { alignEdges: true });
    }
  };

  const moveNav = (direction: 'forward' | 'backward') => {
    const candidates = getNavCandidates();
    if (candidates.length === 0) return;
    const { element: current, wasSet } = ensureSelection('nav');
    if (!current) return;

    const currentIndex = candidates.indexOf(current);
    if (currentIndex === -1) return;

    if (wasSet) {
      showNavHighlight(current);
      current.click();
      return;
    }

    const nextIndex = direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= candidates.length) {
      showNavHighlight(current);
      return;
    }

    const next = candidates[nextIndex];
    setNavSelection(next, true);
    next.click();
  };

  const activateMainSelection = () => {
    const { element: current } = ensureSelection('main');
    if (!current) return;
    activateElement(current);
  };

  const enterSelectMode = (select: HTMLSelectElement) => {
    selectModeRef.current = select;
    openNativeSelect(select);
  };

  const exitSelectMode = () => {
    selectModeRef.current = null;
  };

  const enterListboxMode = (listbox: HTMLElement, trigger?: HTMLElement) => {
    const options = findListboxOptions(listbox);
    if (options.length === 0) return;
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.getAttribute('aria-selected') === 'true')
    );
    listboxModeRef.current = { listbox, options, index: selectedIndex, trigger };
    applyListboxHighlight(options[selectedIndex]);
  };

  const setNavModeActive = (active: boolean) => {
    if (navModeActiveRef.current === active) return;
    navModeActiveRef.current = active;
    if (!active) {
      const lastMain = lastMainRef.current;
      if (lastMain && isElementVisible(lastMain) && isTextEntryElement(lastMain)) {
        lastMain.focus();
      }
      exitSelectMode();
      exitListboxMode();
      clearHighlights();
      return;
    }
    ensureSelection('main');
    ensureSelection('nav');
  };

  useEffect(() => {
    const handlePointerSelection = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const scope = getActiveScopeRoot();
      if (!scope.contains(target)) return;
      if (listboxModeRef.current) {
        if (listboxModeRef.current.listbox.contains(target)) {
          window.setTimeout(() => {
            if (listboxModeRef.current && !isElementVisible(listboxModeRef.current.listbox)) {
              exitListboxMode();
            }
          }, 0);
          return;
        }
        if (!listboxModeRef.current.listbox.contains(target)) {
          exitListboxMode();
        }
      }
      const focusable = target.closest<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable) return;
      if (focusable.matches('[disabled], [aria-disabled="true"]')) return;
      if (isInNavContainer(focusable)) return;
      if (isExcludedFromMain(focusable)) return;
      setMainSelection(focusable);
      if (selectModeRef.current && focusable !== selectModeRef.current) {
        exitSelectMode();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const dropdownModeActive = Boolean(selectModeRef.current || listboxModeRef.current);
      const modifierActive = event.ctrlKey || event.metaKey;
      if (modifierActive) {
        setNavModeActive(true);
      }

      if ((!modifierActive && !dropdownModeActive) || !isNavigationKey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (listboxModeRef.current && !isElementVisible(listboxModeRef.current.listbox)) {
        exitListboxMode();
      }

      const direction = getKeyDirection(event);
      const key = event.key.toLowerCase();
      const selectMode = selectModeRef.current;
      const listboxMode = listboxModeRef.current;

      if (selectMode) {
        if (direction === 'up') {
          stepSelectOption(selectMode, -1);
          return;
        }
        if (direction === 'down') {
          stepSelectOption(selectMode, 1);
          return;
        }
        if (isSpaceKey(event)) {
          const activeSelect = selectModeRef.current;
          exitSelectMode();
          if (activeSelect) {
            activeSelect.blur();
          }
          return;
        }
        return;
      }

      if (listboxMode) {
        if (direction === 'up' || direction === 'down') {
          const delta = direction === 'up' ? -1 : 1;
          const nextIndex = listboxMode.index + delta;
          if (nextIndex >= 0 && nextIndex < listboxMode.options.length) {
            listboxMode.index = nextIndex;
            applyListboxHighlight(listboxMode.options[nextIndex]);
          }
          return;
        }
        if (isSpaceKey(event)) {
          const option = listboxMode.options[listboxMode.index];
          option.click();
          exitListboxMode();
          return;
        }
        return;
      }

      if (direction === 'up') moveMain('up');
      if (direction === 'down') moveMain('down');
      if (direction === 'left') moveMain('left');
      if (direction === 'right') moveMain('right');
      if (key === 'f') moveNav('forward');
      if (key === 'r') moveNav('backward');
      if (isSpaceKey(event)) {
        const { element: current } = ensureSelection('main');
        if (!current) return;
        if (current instanceof HTMLSelectElement) {
          enterSelectMode(current);
          return;
        }
        if (
          current.getAttribute('aria-haspopup') === 'listbox' ||
          current.getAttribute('role') === 'combobox'
        ) {
          current.click();
          window.setTimeout(() => {
            const listbox = findListboxForTrigger(current);
            if (listbox) {
              enterListboxMode(listbox, current);
            }
          }, 0);
          return;
        }
        activateMainSelection();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (selectModeRef.current || listboxModeRef.current) {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) {
        setNavModeActive(false);
      }
    };

    const handleBlur = () => {
      setNavModeActive(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pointerdown', handlePointerSelection, true);
    window.addEventListener('focusin', handlePointerSelection, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pointerdown', handlePointerSelection, true);
      window.removeEventListener('focusin', handlePointerSelection, true);
    };
  }, []);
};

export default useKeyboardNavigation;
