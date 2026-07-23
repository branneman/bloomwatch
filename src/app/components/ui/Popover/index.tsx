import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import styles from "./index.module.css";

export interface PopoverProps {
  triggerLabel: ReactNode;
  triggerClassName?: string;
  children: ReactNode;
}

// Hand-rolled hover/focus/tap popover (the project has no positioning
// library dependency) — one interaction model composes mouse, keyboard,
// and touch input rather than branching on device type. See
// docs/specs/judgement-rollup-tooltip-design.md.
export function Popover({
  triggerLabel,
  triggerClassName,
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [placeAbove, setPlaceAbove] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting placement is tied to the open->closed transition itself (an external DOM-measurement concern, not same-render state derivation the rule targets), and must run before the early return below.
      setPlaceAbove(false);
      return;
    }
    const content = contentRef.current;
    if (!content) return;
    setPlaceAbove(content.getBoundingClientRect().bottom > window.innerHeight);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Real (non-delegated) mouseenter/mouseleave, attached directly to the
  // container rather than via React's onMouseEnter/onMouseLeave props.
  // React synthesizes those from bubbled mouseover/mouseout + relatedTarget,
  // which fires a false leave the moment the pointer crosses from the
  // trigger into the popover's own content (still inside the container) if
  // relatedTarget can't be resolved for the transition. A native listener
  // fires only when the container's own boundary is actually left, so
  // moving from the trigger to a link inside the open content correctly
  // keeps it open.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function handleMouseEnter() {
      setOpen(true);
    }
    function handleMouseLeave() {
      setOpen(false);
    }
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  // onClick always sets true, never toggles: a real click (mouse or touch,
  // which synthesizes a full mouse-event sequence) always fires mouseenter
  // immediately before click, so a toggle would open-then-instantly-close
  // on every tap. Closing is handled entirely by mouseleave (native
  // listener above)/blur/Escape/outside-click below.
  return (
    <div ref={containerRef} className={styles.container} onBlur={handleBlur}>
      <button
        type="button"
        className={
          triggerClassName
            ? `${styles.trigger} ${triggerClassName}`
            : styles.trigger
        }
        aria-expanded={open}
        aria-controls={contentId}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          ref={contentRef}
          id={contentId}
          className={
            placeAbove ? `${styles.content} ${styles.above}` : styles.content
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}
