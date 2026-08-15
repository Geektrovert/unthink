export const ui = {
  actions: "mt-5 flex flex-wrap items-center gap-2.5 max-[42rem]:[&>*]:grow",
  brand: "text-lg font-bold text-ink no-underline",
  capsule:
    "grid gap-3 [&_div]:border-b [&_div]:border-line [&_div]:py-3 [&_dt]:text-sm [&_dt]:font-bold [&_dt]:text-muted [&_dt]:capitalize [&_dd]:mt-1 [&_dd]:mb-0",
  check: "flex items-center gap-3 leading-6 [&_input]:size-5",
  checkbox:
    "grid size-5 shrink-0 place-items-center rounded-[0.35rem] border border-line bg-surface text-on-action data-checked:border-action data-checked:bg-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  checkboxIndicator: "grid place-items-center text-sm leading-none",
  content:
    "mx-auto grid w-[min(calc(100%-2*var(--ds-space-page)),70rem)] gap-4 py-[var(--ds-space-page)] [&>.unthink-panel]:mx-0",
  error: "m-0 font-semibold text-[oklch(0.45_0.17_25)]",
  eyebrow: "m-0 text-sm font-semibold text-muted",
  field:
    "grid gap-2 font-semibold [&_input]:min-h-11 [&_input]:rounded-control [&_input]:border [&_input]:border-line [&_input]:bg-surface [&_input]:p-3 [&_input]:text-ink [&_select]:min-h-11 [&_select]:rounded-control [&_select]:border [&_select]:border-line [&_select]:bg-surface [&_select]:p-3 [&_select]:text-ink [&_textarea]:min-h-11 [&_textarea]:rounded-control [&_textarea]:border [&_textarea]:border-line [&_textarea]:bg-surface [&_textarea]:p-3 [&_textarea]:text-ink [&_:is(input,textarea,select):focus-visible]:outline-2 [&_:is(input,textarea,select):focus-visible]:outline-offset-2 [&_:is(input,textarea,select):focus-visible]:outline-focus",
  header:
    "sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-[color-mix(in_oklch,var(--ds-canvas)_94%,transparent)] px-[var(--ds-space-page)] py-3.5 backdrop-blur-md max-[42rem]:static max-[42rem]:items-start [&_nav]:flex [&_nav]:flex-wrap [&_nav]:items-center [&_nav]:gap-2.5 max-[42rem]:[&_nav]:justify-end [&_nav_a]:min-h-11 [&_nav_a]:rounded-control [&_nav_a]:px-3 [&_nav_a]:py-2.5 [&_nav_a]:font-semibold [&_nav_a]:text-muted [&_nav_a]:no-underline hover:[&_nav_a]:bg-[color-mix(in_oklch,var(--ds-action)_9%,var(--ds-canvas))] hover:[&_nav_a]:text-ink focus-visible:[&_a]:outline-2 focus-visible:[&_a]:outline-offset-2 focus-visible:[&_a]:outline-focus",
  list: "mt-4 grid gap-3 [&>a]:grid [&>a]:gap-1.5 [&>a]:rounded-control [&>a]:border [&>a]:border-line [&>a]:p-4 [&>a]:text-ink [&>a]:no-underline focus-visible:[&>a]:outline-2 focus-visible:[&>a]:outline-offset-2 focus-visible:[&>a]:outline-focus [&>a_span]:text-muted",
  listItem: "grid gap-1.5 rounded-control border border-line p-4 text-ink [&_span]:text-muted",
  muted: "m-0 mt-3 leading-relaxed text-muted",
  page: "flex min-h-dvh items-center p-[var(--ds-space-page)]",
  passwordControl: "relative",
  passwordInput: "w-full !pl-12",
  passwordToggle:
    "absolute top-1/2 left-2 z-1 grid size-9 -translate-y-1/2 place-items-center rounded-control border-0 bg-transparent text-muted hover:bg-[color-mix(in_oklch,var(--ds-action)_8%,var(--ds-surface))] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus [&_svg]:size-5",
  panel:
    "unthink-panel mx-auto w-[min(100%,42rem)] rounded-panel border border-line bg-surface p-[clamp(1.25rem,4vw,2rem)] shadow-panel [&_h1]:mt-2 [&_h1]:mb-0 [&_h1]:text-[clamp(1.8rem,5vw,2.5rem)] [&_h1]:leading-tight [&_h2]:mt-0 [&_h2]:mb-4 [&_h2]:text-[clamp(1.5rem,4vw,2rem)] [&_h2]:leading-tight [&_p]:leading-relaxed",
  rail: "grid gap-1 rounded-panel border border-line bg-surface p-2 max-[42rem]:grid-cols-5 max-[42rem]:overflow-x-auto [&_span]:rounded-control [&_span]:p-3 [&_span]:capitalize [&_span]:text-muted max-[42rem]:[&_span]:px-1.5 max-[42rem]:[&_span]:text-center max-[42rem]:[&_span]:text-xs [&_span[aria-current=step]]:bg-[color-mix(in_oklch,var(--ds-action)_11%,var(--ds-surface))] [&_span[aria-current=step]]:font-bold [&_span[aria-current=step]]:text-ink",
  selectIcon: "ml-auto text-muted",
  selectItem:
    "grid cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-[0.35rem] px-2.5 py-2 outline-hidden data-highlighted:bg-action data-highlighted:text-on-action",
  selectPopup:
    "z-30 max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto rounded-control border border-line bg-surface p-1 text-ink shadow-panel outline-hidden",
  selectPositioner: "z-30 outline-hidden",
  selectTrigger:
    "flex min-h-11 w-full items-center gap-3 rounded-control border border-line bg-surface p-3 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  settingsNav:
    "flex flex-wrap items-center gap-2.5 self-start [&_a]:min-h-11 [&_a]:rounded-control [&_a]:px-3 [&_a]:py-2.5 [&_a]:font-semibold [&_a]:text-muted [&_a]:no-underline hover:[&_a]:bg-[color-mix(in_oklch,var(--ds-action)_9%,var(--ds-canvas))] hover:[&_a]:text-ink [&_a[aria-current=page]]:bg-[color-mix(in_oklch,var(--ds-action)_9%,var(--ds-canvas))] [&_a[aria-current=page]]:text-ink",
  stack: "mt-6 grid gap-4",
  status: "mt-4 mb-0 text-sm text-muted",
  textButton:
    "mt-4 border-0 bg-transparent px-0 py-2 font-semibold text-action no-underline hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
  workspace:
    "grid grid-cols-[minmax(7rem,0.3fr)_minmax(0,1fr)] items-start gap-4 max-[42rem]:grid-cols-1 [&_.unthink-panel]:mx-0",
} as const;
