/**
 * Inline SVG path fragments for the sidebar nav. Every entry is the
 * INNER markup (paths, circles, polylines…) of a heroicons-outline-style
 * 24×24 icon. The wrapper `<svg>` is rendered by the sidebar itself so
 * stroke-width, size and colour stay consistent across the nav.
 *
 * Keeping these as raw strings (rendered via [innerHTML]) means we don't
 * pull in a heroicons package just to draw a dozen glyphs. Paths are
 * hand-adapted from the outline set to keep the 1.75 stroke crisp.
 */
export const SIDEBAR_ICONS: Record<string, string> = {
  // Overview
  home: `<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>`,

  // Work the book
  users: `<circle cx="9" cy="8" r="3.25"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 11a3 3 0 1 0 0-6"/><path d="M17.5 20a5.5 5.5 0 0 0-2.5-4.6"/>`,
  kanban: `<rect x="4" y="8" width="3.5" height="12" rx="0.75"/><rect x="10.25" y="8" width="3.5" height="12" rx="0.75"/><rect x="16.5" y="8" width="3.5" height="12" rx="0.75"/><circle cx="5.75" cy="5" r="1.25"/><circle cx="12" cy="5" r="1.25"/><circle cx="18.25" cy="5" r="1.25"/>`,

  // Reporting & delivery
  'chart-bar': `<path d="M4 4v16h16"/><rect x="7.5" y="12" width="2.5" height="5" rx="0.5"/><rect x="12" y="8.5" width="2.5" height="8.5" rx="0.5"/><rect x="16.5" y="5.5" width="2.5" height="11.5" rx="0.5"/>`,
  'document-check': `<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5"/><path d="m9 14 2 2 4-4"/>`,

  // Client outreach
  megaphone: `<path d="M3 10v4a1 1 0 0 0 1 1h2l6 4V5L6 9H4a1 1 0 0 0-1 1Z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M18.5 6a8 8 0 0 1 0 12"/>`,
  inbox: `<path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M4 13 6 5h12l2 8"/><path d="M4 13h4l1.5 2h5L16 13h4"/>`,

  // Settings
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  plug: `<path d="M9 3v4"/><path d="M15 3v4"/><path d="M6.5 7h11v4a5.5 5.5 0 0 1-11 0V7Z"/><path d="M12 16.5V21"/>`,
  layout: `<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17"/><path d="M9.5 9v11"/>`,
  box: `<path d="m3.5 7.5 8.5-4 8.5 4"/><path d="M3.5 7.5v9l8.5 4 8.5-4v-9"/><path d="M3.5 7.5 12 11.5l8.5-4"/><path d="M12 11.5V20.5"/>`,
  'check-list': `<path d="M4 6h2l1 1 2-2"/><path d="M4 12h2l1 1 2-2"/><path d="M4 18h2l1 1 2-2"/><path d="M12 6h8"/><path d="M12 12h8"/><path d="M12 18h8"/>`,
  'clipboard-list': `<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9 3.5h6a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M9.5 11h6"/><path d="M9.5 14.5h6"/><path d="M9.5 18h3.5"/>`,
  shield: `<path d="M12 3 4.5 6v6c0 4.5 3 8 7.5 9 4.5-1 7.5-4.5 7.5-9V6L12 3Z"/><path d="m9 12 2 2 4-4"/>`,

  // Platform admin
  'user-circle': `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5a6 6 0 0 1 11 0"/>`,

  // Sidebar chrome
  'chevron-left': `<path d="m14 6-6 6 6 6"/>`,
  'chevron-right': `<path d="m10 6 6 6-6 6"/>`,
  'settings-gear': `<circle cx="12" cy="12" r="3"/><path d="M19.5 12a7.5 7.5 0 0 0-.15-1.5l2-1.5-2-3.5-2.35.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4a7.5 7.5 0 0 0-2.6 1.5L4.65 5.5l-2 3.5 2 1.5A7.5 7.5 0 0 0 4.5 12c0 .5.05 1 .15 1.5l-2 1.5 2 3.5 2.35-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.6-1.5l2.35.9 2-3.5-2-1.5c.1-.5.15-1 .15-1.5Z"/>`,
  logout: `<path d="M15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3"/><path d="M10 8 6 12l4 4"/><path d="M6 12h10"/>`,
  menu: `<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>`,
  close: `<path d="M6 6l12 12"/><path d="M18 6 6 18"/>`,
};
