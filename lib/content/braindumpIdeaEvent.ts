/**
 * Window event used to reopen the global braindump overlay pre-loaded with an
 * existing idea's text (task 86d3cpv9x). A content row dispatches it; the global
 * BottomNav (which owns the overlay) listens and opens with the idea.
 */
export const OPEN_BRAINDUMP_IDEA_EVENT = 'ruta:open-braindump-idea';

export type OpenBraindumpIdeaDetail = { id: string; text: string };

/**
 * Window event used to open the SAME global braindump overlay for a FRESH
 * capture (no pre-loaded idea) — the desktop sidebar's "Наговорити" create
 * option dispatches it so it reuses the one overlay instance owned by BottomNav,
 * exactly like the mobile FAB's idea option (task 86d3d2t4j). Mobile FAB is
 * untouched; this is just an additional trigger for the existing overlay.
 */
export const OPEN_BRAINDUMP_FRESH_EVENT = 'ruta:open-braindump-fresh';
