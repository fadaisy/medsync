/**
 * The health card's gold chip: illustration colours, not UI, so they live
 * with the data rather than in a component (no raw colours in components).
 * Its own file so the card primitive does not pull the Me repository in.
 */
export const CARD_ART = { chip: "#d9bf66", chipLine: "rgba(0, 0, 0, 0.25)" } as const;
