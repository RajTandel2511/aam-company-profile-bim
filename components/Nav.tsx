"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { company, contact } from "@/lib/content";
import { motionTokens, springs } from "@/lib/motion-tokens";
import { scrollToTarget } from "@/lib/smooth-scroll";
import { useViewer } from "@/lib/viewer-state";
import { DroneGlyph } from "@/components/chrome/DroneGlyph";
import { StyleSwitch } from "@/components/chrome/StyleSwitch";
import { useActiveView, useCanFly, useDroneLauncher } from "@/components/chrome/hooks";
import { BROWSER, VIEWS, viewOf, type View, type ViewId } from "@/components/chrome/views";
import { BrandMark } from "@/components/shell/BrandMark";
import { MotionToggle } from "@/components/shell/MotionToggle";
import { BID_HREF } from "@/components/shell/site";

const MENU_ID = "project-browser";
const WIDE = "(min-width: 1024px)"; // lg: the full ribbon replaces the compact bar and its sheet
/** The logo's three streams as the model's airflows: supply, exhaust / outside air, return. */
const STREAMS = ["bg-supply", "bg-exhaust", "bg-return"] as const;
/** The drone view needs JS: without it these controls stay out of the page (see useCanFly). */
const NEEDS_JS = "hidden [.js_&]:inline-flex";

// Menu icon: the three streams stacked, folding into an X.
const BAR_GAP = motionTokens.distance.sm;
const BARS_CLOSED = [
  { y: -BAR_GAP, rotate: 0, opacity: 1 },
  { y: 0, rotate: 0, opacity: 1 },
  { y: BAR_GAP, rotate: 0, opacity: 1 },
];
const BARS_OPEN = [
  { y: 0, rotate: 45, opacity: 1 },
  { y: 0, rotate: 0, opacity: 0 },
  { y: 0, rotate: -45, opacity: 1 },
];

type Launcher = { ref: RefObject<HTMLButtonElement>; launch: () => void };

/**
 * The BIM-app ribbon. From lg: the AAM mark as the application button, then a
 * title row (name, breadcrumb to the view on screen, visual style, drone view)
 * over a tab strip (one tab per saved view, the lit tab sliding to the view on
 * screen; pause motion; the bid CTA). Below lg: a compact bar (mark, drone,
 * menu) opening a full-screen project browser. Hidden in the drone view.
 */
export default function Nav() {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const active = useActiveView();
  const { drone } = useViewer();
  const canFly = useCanFly();
  const deskFly = useDroneLauncher<HTMLButtonElement>();
  const barFly = useDroneLauncher<HTMLButtonElement>();
  const { scrollYProgress } = useScroll();

  useMenuSheetLock(open, setOpen, headerRef, menuRef);
  useEffect(() => {
    if (drone) setOpen(false); // the drone view takes the whole screen
  }, [drone]);

  const view = viewOf(active);
  const close = () => setOpen(false);
  // From the open sheet: Lenis is stopped while the sheet locks the page, so close first, act next frame.
  const jump = (hash: string) => {
    setOpen(false);
    requestAnimationFrame(() => scrollToTarget(hash));
  };
  const flyFromSheet = () => {
    setOpen(false);
    requestAnimationFrame(barFly.launch); // focus comes back to the bar's drone button
  };
  const handleLogo = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!open) return; // a plain anchor: Lenis glides it
    e.preventDefault();
    jump("#top");
  };

  return (
    // layoutRoot: the sliding tab and style segment ignore page scroll inside this fixed bar
    <motion.header
      ref={headerRef}
      layoutRoot
      className="fixed inset-x-0 top-0 z-50"
      initial={false}
      animate={{ opacity: drone ? 0 : 1 }}
      transition={{ duration: reduce ? motionTokens.duration.fast : motionTokens.duration.normal }}
      // gone at once in the drone view (out of the tab order and the a11y tree); fades back on the way out
      style={{ visibility: drone ? "hidden" : "visible" }}
    >
      <div className="relative z-10 flex h-[var(--nav-h)] items-stretch border-b border-hair bg-deep/95 shadow-[0_14px_34px_-22px_rgb(0_0_0/0.9)]">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/45 to-transparent" />
        <ScrollProgress progress={scrollYProgress} reduce={reduce} />

        <a
          href="#top"
          onClick={handleLogo}
          aria-label={`${company.name} — back to top`}
          className="flex shrink-0 items-center rounded-sm pl-[var(--gutter)] pr-3 lg:border-r lg:border-hair lg:px-4 xl:px-5"
        >
          <BrandMark draw="load" className="block h-9 w-auto lg:h-10" />
        </a>

        <Ribbon view={view} active={active} reduce={reduce} canFly={canFly} fly={deskFly} />
        <CompactBar view={view} reduce={reduce} canFly={canFly} fly={barFly}>
          <MenuButton open={open} onToggle={() => setOpen((o) => !o)} buttonRef={menuRef} />
        </CompactBar>
      </div>

      <AnimatePresence>
        {open && (
          <ProjectBrowser key="sheet" active={active} reduce={reduce} canFly={canFly} onNavigate={close} onJump={jump} onFly={flyFromSheet} />
        )}
      </AnimatePresence>
    </motion.header>
  );
}

type RibbonProps = { view: View; active: ViewId; reduce: boolean; canFly: boolean; fly: Launcher };

/** lg and up: title row over the tab strip. */
function Ribbon({ view, active, reduce, canFly, fly }: RibbonProps) {
  return (
    <div className="hidden min-w-0 flex-1 flex-col px-4 lg:flex xl:px-5">
      <div className="flex h-8 items-center justify-between gap-6 border-b border-hair/60">
        <p className="flex min-w-0 items-center gap-3">
          <span className="whitespace-nowrap text-[13px] font-extrabold tracking-tight text-chalk">{company.short}</span>
          <span aria-hidden className="h-3 w-px shrink-0 bg-hair" />
          <Breadcrumb view={view} reduce={reduce} />
        </p>
        {canFly && (
          <div className="hidden shrink-0 items-center gap-2 [.js_&]:flex">
            <StyleSwitch />
            <button
              ref={fly.ref}
              type="button"
              onClick={fly.launch}
              className="hud inline-flex h-[30px] items-center gap-2 rounded-[5px] border border-cyan/45 bg-cyan/10 px-3 text-cyan transition-colors hover:border-cyan hover:bg-cyan/20 hover:text-chalk"
            >
              <DroneGlyph className="h-3.5 w-3.5" />
              Drone view
            </button>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-end justify-between gap-6">
        <nav aria-label="Views" className="min-w-0">
          <Tabs active={active} reduce={reduce} />
        </nav>
        <div className="flex shrink-0 items-center gap-2 self-center">
          <MotionToggle variant="bar" />
          <a href={BID_HREF} className="btn btn-primary px-4 py-2 text-[12.5px]">
            Request a bid
          </a>
        </div>
      </div>
    </div>
  );
}

type CompactBarProps = { view: View; reduce: boolean; canFly: boolean; fly: Launcher; children: ReactNode };

/** Below lg: name and current view, the drone button, then the menu button (children). */
function CompactBar({ view, reduce, canFly, fly, children }: CompactBarProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pr-[var(--gutter)] lg:hidden">
      <p className="min-w-0 flex-1 leading-none">
        <span className="block truncate text-[15px] font-extrabold tracking-tight text-chalk">{company.short}</span>
        <span className="mt-1.5 flex">
          <Breadcrumb view={view} reduce={reduce} compact />
        </span>
      </p>
      {canFly && (
        <button
          ref={fly.ref}
          type="button"
          onClick={fly.launch}
          aria-label="Drone view"
          className={`${NEEDS_JS} hud h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-cyan/45 bg-cyan/10 px-3.5 text-cyan transition-colors hover:border-cyan hover:bg-cyan/20`}
        >
          <DroneGlyph className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">Drone</span>
        </button>
      )}
      {children}
    </div>
  );
}

/** "Company profile ▸ {view}" — the view name swaps with a short cross-fade as sections pass. */
function Breadcrumb({ view, reduce, compact = false }: { view: View; reduce: boolean; compact?: boolean }) {
  return (
    <span className="hud flex min-w-0 items-center gap-1.5 text-fog">
      {!compact && <span className="shrink-0 whitespace-nowrap">Company profile</span>}
      <span aria-hidden className="shrink-0 text-cyan">
        ▸
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={view.id}
          className="truncate text-mist"
          initial={{ opacity: 0, y: motionTokens.distance.xs }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -motionTokens.distance.xs }}
          transition={{ duration: reduce ? motionTokens.duration.instant : motionTokens.duration.fast, ease: motionTokens.easing.smooth }}
        >
          {view.name}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** One ribbon tab per saved view; the lit tab (raised, cyan top edge) slides to the view on screen. */
function Tabs({ active, reduce }: { active: ViewId; reduce: boolean }) {
  return (
    <ul className="flex items-end">
      {VIEWS.map((v) => {
        const on = active === v.id;
        return (
          <li key={v.id}>
            <a
              href={`#${v.id}`}
              aria-current={on ? "true" : undefined}
              className={`hud relative flex h-[34px] items-center gap-2 px-3 transition-colors focus-visible:outline-offset-[-3px] xl:px-4 ${
                on ? "text-chalk" : "text-fog hover:text-mist"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="ribbon-tab"
                  aria-hidden
                  className="absolute inset-0 rounded-t-[5px] border border-b-0 border-hair bg-raised"
                  transition={reduce ? { duration: 0 } : springs.snappy}
                >
                  <span className="absolute inset-x-0 -top-px h-[2px] rounded-t-[5px] bg-cyan shadow-[0_0_14px_rgb(var(--cyan-rgb)/0.6)]" />
                </motion.span>
              )}
              <span className={`relative hidden xl:inline ${on ? "text-cyan" : ""}`}>{v.index}</span>
              <span className="relative">{v.label}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Three stream segments that fill in sequence: supply, then exhaust, then return. */
function ScrollProgress({ progress, reduce }: { progress: MotionValue<number>; reduce: boolean }) {
  const smooth = useSpring(progress, springs.release);
  const p = reduce ? progress : smooth;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[2px]">
      {STREAMS.map((fill, i) => (
        <ProgressSegment key={fill} progress={p} index={i} fill={fill} />
      ))}
    </div>
  );
}

function ProgressSegment({ progress, index, fill }: { progress: MotionValue<number>; index: number; fill: string }) {
  const n = STREAMS.length;
  const scaleX = useTransform(progress, [index / n, (index + 1) / n], [0, 1]);
  return <motion.span className={`block h-full flex-1 origin-left ${fill}`} style={{ scaleX }} />;
}

type MenuButtonProps = { open: boolean; onToggle: () => void; buttonRef: RefObject<HTMLButtonElement> };

function MenuButton({ open, onToggle, buttonRef }: MenuButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={open}
      aria-controls={MENU_ID}
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={onToggle}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-chalk/25 bg-void/40 transition-colors hover:border-chalk/60"
    >
      <span aria-hidden className="relative block h-[18px] w-5">
        {STREAMS.map((fill, i) => (
          <motion.span
            key={fill}
            className={`absolute inset-x-0 top-1/2 -mt-px block h-[2px] rounded-full ${fill}`}
            initial={false}
            animate={open ? BARS_OPEN[i] : BARS_CLOSED[i]}
            transition={springs.snappy}
          />
        ))}
      </span>
    </button>
  );
}

type SheetProps = {
  active: ViewId;
  reduce: boolean;
  canFly: boolean;
  /** close the sheet; the link keeps its native action (the mailto bid link) */
  onNavigate: () => void;
  /** close the sheet, then scroll to an in-page "#id" */
  onJump: (hash: string) => void;
  /** close the sheet, then open the drone view */
  onFly: () => void;
};

/** Full-screen project browser below lg: the drawing set filed by folder, then the view controls. */
function ProjectBrowser({ active, reduce, canFly, onNavigate, onJump, onFly }: SheetProps) {
  const item = {
    hidden: { opacity: 0, y: motionTokens.distance.lg },
    shown: {
      opacity: 1,
      y: 0,
      transition: reduce
        ? { duration: motionTokens.duration.fast }
        : { duration: motionTokens.duration.slow, ease: motionTokens.easing.smooth },
    },
  };
  return (
    <motion.div
      id={MENU_ID}
      data-lenis-prevent
      className="blueprint fixed inset-0 z-[5] overflow-y-auto bg-void lg:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? motionTokens.duration.fast : motionTokens.duration.normal }}
    >
      <motion.div
        className="container-x pb-12 pt-[calc(var(--nav-h)+1.5rem)]"
        initial="hidden"
        animate="shown"
        variants={{
          shown: {
            transition: {
              staggerChildren: reduce ? 0 : motionTokens.stagger,
              delayChildren: reduce ? 0 : motionTokens.duration.fast,
            },
          },
        }}
      >
        <motion.p variants={item} className="hud flex items-center justify-between gap-4 border-b border-hair pb-3 text-fog">
          <span className="flex items-center gap-2 text-chalk">
            <span aria-hidden className="h-1.5 w-1.5 rounded-[1px] bg-cyan" />
            Project browser
          </span>
          <span>Company profile</span>
        </motion.p>
        <nav aria-label="Project browser">
          <ul>
            {BROWSER.map((f) => (
              <motion.li key={f.folder} variants={item} className="border-b border-hair/70 py-3">
                <p className="hud flex items-center gap-2 text-fog">
                  <span aria-hidden className="text-cyan">
                    ▾
                  </span>
                  {f.folder}
                </p>
                <ul className="mt-1">
                  {f.views.map((v) => (
                    <BrowserItem key={v.id} view={v} on={active === v.id} onJump={onJump} />
                  ))}
                </ul>
              </motion.li>
            ))}
          </ul>
        </nav>
        <motion.div variants={item} className="pt-8">
          {canFly && (
            <div className="flex flex-col gap-3">
              <p className="hud text-fog">Visual style</p>
              <StyleSwitch size="lg" />
              <button
                type="button"
                onClick={onFly}
                className="btn btn-ghost mt-1 w-full justify-center border-cyan/50 text-cyan hover:border-cyan hover:bg-cyan/10"
              >
                <DroneGlyph className="h-[18px] w-[18px]" />
                Explore in drone view
              </button>
            </div>
          )}
          <MotionToggle variant="sheet" className="mt-4" />
          <a href={BID_HREF} onClick={onNavigate} className="btn btn-primary mt-6 w-full justify-center">
            Request a bid
          </a>
          <p className="mono mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <a href={contact.phoneHref} className="rounded-sm text-mist transition-colors hover:text-chalk">
              {contact.phone}
            </a>
            <a href={`mailto:${contact.email}`} className="rounded-sm text-mist transition-colors hover:text-chalk">
              {contact.email}
            </a>
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function BrowserItem({ view, on, onJump }: { view: View; on: boolean; onJump: (hash: string) => void }) {
  return (
    <li>
      <a
        href={`#${view.id}`}
        onClick={(e) => {
          e.preventDefault();
          onJump(`#${view.id}`);
        }}
        aria-current={on ? "true" : undefined}
        className="relative flex items-center rounded-sm py-2.5 pl-6"
      >
        <span
          aria-hidden
          className={`absolute bottom-2.5 left-[5px] top-2.5 w-[2px] rounded-full ${on ? "bg-cyan shadow-[0_0_10px_rgb(var(--cyan-rgb)/0.8)]" : "bg-hair"}`}
        />
        <span className="min-w-0">
          <span className={`display block text-[clamp(1.7rem,7.5vw,2.5rem)] ${on ? "text-chalk" : "text-mist"}`}>{view.label}</span>
          <span className="hud mt-1.5 block text-fog">
            <span className={on ? "text-cyan" : undefined}>
              {view.index} · {view.sheet}
            </span>{" "}
            · {view.name}
          </span>
        </span>
      </a>
    </li>
  );
}

/**
 * While the sheet is open: page scroll locked, everything outside the header
 * inert, Tab trapped inside the header (bar + sheet), Escape closes and hands
 * focus back to the menu button, widening to lg closes it.
 * The lock is body overflow only: hidden on <html> too would break
 * position: sticky, and SmoothScroll pauses Lenis by watching the body.
 */
function useMenuSheetLock(
  open: boolean,
  setOpen: Dispatch<SetStateAction<boolean>>,
  headerRef: RefObject<HTMLElement>,
  buttonRef: RefObject<HTMLButtonElement>,
) {
  useEffect(() => {
    const header = headerRef.current;
    if (!open || !header) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const outside = Array.from(document.body.children).filter(
      (el) => !el.contains(header) && !el.hasAttribute("inert"),
    );
    outside.forEach((el) => el.setAttribute("inert", ""));
    document.getElementById(MENU_ID)?.querySelector<HTMLElement>("a[href]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(header.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).filter(
        (el) => el.getClientRects().length > 0,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const wide = window.matchMedia(WIDE);
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = prevOverflow;
      outside.forEach((el) => el.removeAttribute("inert"));
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [open, setOpen, headerRef, buttonRef]);
}
