/**
 * Window event used to reopen the global braindump overlay pre-loaded with an
 * existing idea's text (task 86d3cpv9x). A content row dispatches it; the global
 * BottomNav (which owns the overlay) listens and opens with the idea.
 */
export const OPEN_BRAINDUMP_IDEA_EVENT = 'ruta:open-braindump-idea';

export type OpenBraindumpIdeaDetail = { id: string; text: string };
