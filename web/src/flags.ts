// URL feature flags shared by the app modules.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

/**
 * Grappling beta (grab, clinch, Shoulder Throw) for local modes: ?grapple=1 (?grapple=0 / false / off is off). Online
 * rooms keep it off. It turns on both the sim's grappling (SimConfig.grapple) and the recognizer's grapple-only strike
 * rules (GestureRecognizer.grappleEnabled). To turn grappling on by default, make the absent parameter mean on here.
 */
// On by default since Oct 25 ~8:20 AM (REVIEW.md 7:45 AM: on only if strikes, the user's drills and the full e2e suite hold).
export const GRAPPLE = !['0', 'false', 'off'].includes(params.get('grapple') ?? '');
