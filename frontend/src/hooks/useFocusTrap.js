import { useRef, useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps keyboard focus inside a container element.
 * - Focuses the first focusable element on activation
 * - Tab/Shift+Tab cycles within the container
 * - Escape calls onEscape
 * - Returns focus to the previously-focused element on cleanup
 *
 * @param {{ isActive: boolean, onEscape: () => void }} options
 * @returns {import('react').RefObject<HTMLElement>}
 */
export default function useFocusTrap({ isActive, onEscape }) {
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    triggerRef.current = document.activeElement;

    // Focus first focusable element after DOM settles
    requestAnimationFrame(() => {
      const focusables = containerRef.current?.querySelectorAll(FOCUSABLE);
      if (focusables?.length > 0) {
        focusables[0].focus();
      }
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableEls = containerRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusableEls || focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef.current?.focus();
    };
  }, [isActive, onEscape]);

  return containerRef;
}
