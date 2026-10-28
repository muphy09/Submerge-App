import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './AppTooltip.css';

const resolveOverflowTooltipText = (children: ReactNode, tooltipText?: string): string => {
  if (typeof tooltipText === 'string') {
    return tooltipText.trim();
  }

  if (typeof children === 'string' || typeof children === 'number') {
    return String(children).trim();
  }

  return '';
};

const clampTooltipValue = (value: number, min: number, max: number): number => {
  if (max <= min) return min;
  return Math.min(max, Math.max(min, value));
};

type TooltipPlacement = 'top' | 'bottom';

type TooltipPosition = {
  left: number;
  top: number;
  maxWidth: number;
  arrowLeft: number;
  placement: TooltipPlacement;
  ready: boolean;
};

const DEFAULT_TOOLTIP_POSITION: TooltipPosition = {
  left: 0,
  top: 0,
  maxWidth: 320,
  arrowLeft: 24,
  placement: 'top',
  ready: false,
};

const useFloatingTooltip = <T extends HTMLElement>(tooltip?: string | null) => {
  const normalizedTooltip = String(tooltip || '').trim();
  const anchorRef = useRef<T | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>(DEFAULT_TOOLTIP_POSITION);

  const updatePosition = () => {
    if (!anchorRef.current || !tooltipRef.current || typeof window === 'undefined') return;

    const rect = anchorRef.current.getBoundingClientRect();
    const viewportPadding = 18;
    const verticalGap = 12;
    const availableWidth = Math.max(160, window.innerWidth - viewportPadding * 2);
    const maxWidth = Math.min(340, availableWidth);
    const tooltipWidth = Math.min(tooltipRef.current.offsetWidth || maxWidth, maxWidth);
    const tooltipHeight = tooltipRef.current.offsetHeight || 0;
    const anchorCenter = rect.left + rect.width / 2;
    const minCenter = viewportPadding + tooltipWidth / 2;
    const maxCenter = window.innerWidth - viewportPadding - tooltipWidth / 2;
    const left = clampTooltipValue(anchorCenter, minCenter, maxCenter);
    const canFitAbove = rect.top - tooltipHeight - verticalGap >= viewportPadding;
    const placement: TooltipPlacement = canFitAbove ? 'top' : 'bottom';
    const unclampedTop = placement === 'top' ? rect.top - tooltipHeight - verticalGap : rect.bottom + verticalGap;
    const top = clampTooltipValue(
      unclampedTop,
      viewportPadding,
      Math.max(viewportPadding, window.innerHeight - tooltipHeight - viewportPadding)
    );
    const tooltipLeftEdge = left - tooltipWidth / 2;
    const arrowLeft = clampTooltipValue(anchorCenter - tooltipLeftEdge, 18, Math.max(18, tooltipWidth - 18));

    setPosition({
      left,
      top,
      maxWidth,
      arrowLeft,
      placement,
      ready: true,
    });
  };

  useLayoutEffect(() => {
    if (!isVisible || !normalizedTooltip || typeof window === 'undefined') return;

    const frame = window.requestAnimationFrame(updatePosition);
    const handleWindowChange = () => updatePosition();
    const observer = new ResizeObserver(handleWindowChange);
    if (tooltipRef.current) observer.observe(tooltipRef.current);
    if (anchorRef.current) observer.observe(anchorRef.current);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [isVisible, normalizedTooltip]);

  useEffect(() => {
    if (!normalizedTooltip && isVisible) {
      setIsVisible(false);
      setPosition(DEFAULT_TOOLTIP_POSITION);
    }
  }, [normalizedTooltip, isVisible]);

  const showTooltip = (target?: HTMLElement) => {
    if (target) anchorRef.current = target as T;
    if (!normalizedTooltip) return;
    setPosition((current) => ({ ...current, ready: false }));
    setIsVisible(true);
    window.requestAnimationFrame(updatePosition);
  };

  const hideTooltip = () => {
    setIsVisible(false);
  };

  const tooltipPortal =
    isVisible && normalizedTooltip && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={tooltipRef}
            className="app-tooltip-floating"
            data-placement={position.placement}
            role="tooltip"
            style={{
              left: `${position.left}px`,
              top: `${position.top}px`,
              maxWidth: `${position.maxWidth}px`,
              opacity: position.ready ? 1 : 0,
            }}
          >
            {normalizedTooltip}
            <span
              className="app-tooltip-floating-arrow"
              aria-hidden="true"
              style={{ left: `${position.arrowLeft}px` }}
            />
          </div>,
          document.body
        )
      : null;

  return {
    anchorRef,
    hideTooltip,
    showTooltip,
    tooltipPortal,
  };
};

type OverflowTooltipTextProps = {
  as?: 'span' | 'p';
  className?: string;
  children: ReactNode;
  tooltipText?: string;
};

export const OverflowTooltipText = ({
  as = 'span',
  className,
  children,
  tooltipText,
}: OverflowTooltipTextProps) => {
  const fullText = resolveOverflowTooltipText(children, tooltipText);
  const { anchorRef, showTooltip, hideTooltip, tooltipPortal } = useFloatingTooltip<HTMLElement>(fullText);
  const tooltipClassName = ['app-tooltip-target', className].filter(Boolean).join(' ');

  const maybeShowTooltip = (target: HTMLElement) => {
    const isOverflowing = target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight;
    if (!isOverflowing || !fullText) {
      hideTooltip();
      return;
    }

    showTooltip();
  };

  const handleMouseEnter: MouseEventHandler<HTMLElement> = (event) => {
    maybeShowTooltip(event.currentTarget);
  };

  const handleFocusCapture: FocusEventHandler<HTMLElement> = (event) => {
    maybeShowTooltip(event.currentTarget);
  };

  if (as === 'p') {
    return (
      <>
        <p
          ref={anchorRef as any}
          className={tooltipClassName}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={hideTooltip}
          onFocusCapture={handleFocusCapture}
          onBlurCapture={hideTooltip}
        >
          {children}
        </p>
        {tooltipPortal}
      </>
    );
  }

  return (
    <>
      <span
        ref={anchorRef as any}
        className={tooltipClassName}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={hideTooltip}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={hideTooltip}
      >
        {children}
      </span>
      {tooltipPortal}
    </>
  );
};

type TooltipAnchorProps = {
  tooltip?: string | null;
  className?: string;
  as?: 'span' | 'div';
  followTarget?: boolean;
  children: ReactNode;
};

export const TooltipAnchor = ({ tooltip, className, as = 'span', children, followTarget = false }: TooltipAnchorProps) => {
  const { anchorRef, showTooltip, hideTooltip, tooltipPortal } = useFloatingTooltip<
    HTMLSpanElement | HTMLDivElement
  >(tooltip);
  const Component = as;

  return (
    <>
      <Component
        ref={followTarget ? undefined : anchorRef as any}
        className={['app-tooltip-anchor', as === 'div' ? 'app-tooltip-anchor--block' : '', className]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={followTarget ? undefined : () => showTooltip()}
        onMouseOver={followTarget ? event => {
          if ((event.target as HTMLElement).closest('.price-impact-trigger-wrap')) { hideTooltip(); return; }
          const target = (event.target as HTMLElement).closest<HTMLElement>('input, select, textarea, button, [role="checkbox"], label');
          if (target && event.currentTarget.contains(target)) showTooltip(target);
          else hideTooltip();
        } : undefined}
        onMouseLeave={hideTooltip}
        onFocusCapture={event => showTooltip(followTarget ? event.target as HTMLElement : undefined)}
        onBlurCapture={hideTooltip}
      >
        {children}
      </Component>
      {tooltipPortal}
    </>
  );
};
