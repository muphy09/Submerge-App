import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type AdaptiveTablePaginationOptions = {
  itemCount: number;
  maxPageSize: number;
  estimatedRowHeight: number;
  estimatedHeaderHeight?: number;
  resetKey?: string;
  viewportHeightRatio?: number;
  minViewportHeight?: number;
  maxViewportHeight?: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function useAdaptiveTablePagination({
  itemCount,
  maxPageSize,
  estimatedRowHeight,
  estimatedHeaderHeight = 44,
  resetKey = '',
  viewportHeightRatio,
  minViewportHeight = 240,
  maxViewportHeight = 680,
}: AdaptiveTablePaginationOptions) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [pageSize, setPageSize] = useState(maxPageSize);
  const [currentPage, setCurrentPage] = useState(1);

  const measurePageSize = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportStyles = window.getComputedStyle(viewport);
    const paddingHeight =
      (Number.parseFloat(viewportStyles.paddingTop) || 0) +
      (Number.parseFloat(viewportStyles.paddingBottom) || 0);
    const header = viewport.querySelector('thead') as HTMLElement | null;
    const renderedRows = Array.from(viewport.querySelectorAll('tbody tr')) as HTMLElement[];
    const measuredRowHeight = renderedRows.reduce(
      (largest, row) => Math.max(largest, row.getBoundingClientRect().height),
      estimatedRowHeight
    );
    const headerHeight = Math.max(header?.getBoundingClientRect().height || 0, estimatedHeaderHeight);
    const availableHeight = viewportHeightRatio
      ? clamp(window.innerHeight * viewportHeightRatio, minViewportHeight, maxViewportHeight)
      : viewport.clientHeight;

    if (availableHeight <= headerHeight + paddingHeight || measuredRowHeight <= 0) return;

    const nextPageSize = clamp(
      Math.floor((availableHeight - headerHeight - paddingHeight) / measuredRowHeight),
      1,
      maxPageSize
    );

    setPageSize((previousPageSize) => {
      if (previousPageSize === nextPageSize) return previousPageSize;
      setCurrentPage((previousPage) => {
        const previousStartIndex = (previousPage - 1) * previousPageSize;
        return Math.floor(previousStartIndex / nextPageSize) + 1;
      });
      return nextPageSize;
    });
  }, [estimatedHeaderHeight, estimatedRowHeight, maxPageSize, maxViewportHeight, minViewportHeight, viewportHeightRatio]);

  useLayoutEffect(() => {
    measurePageSize();
  }, [currentPage, itemCount, measurePageSize, pageSize]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let animationFrame = 0;
    const scheduleMeasurement = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measurePageSize);
    };
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasurement);

    resizeObserver?.observe(viewport);
    window.addEventListener('resize', scheduleMeasurement);
    scheduleMeasurement();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleMeasurement);
    };
  }, [itemCount, measurePageSize, resetKey]);

  useLayoutEffect(() => {
    setCurrentPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize));

  useLayoutEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(page, 1), totalPages));
  }, [totalPages]);

  const pagination = useMemo(() => {
    const startIndex = itemCount === 0 ? 0 : (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, itemCount);
    return { startIndex, endIndex };
  }, [currentPage, itemCount, pageSize]);

  const goToPage = useCallback(
    (page: number) => setCurrentPage(clamp(page, 1, totalPages)),
    [totalPages]
  );

  return {
    viewportRef,
    currentPage,
    pageSize,
    totalPages,
    startIndex: pagination.startIndex,
    endIndex: pagination.endIndex,
    goToPage,
  };
}
