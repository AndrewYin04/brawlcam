// URL feature flags shared by the app modules.
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

/**
 * Grappling beta (grab, clinch, Shoulder Throw) for local modes: ?grapple=1 (?grapple=0 / false / off is off). Online
 * rooms keep it off. It turns on both the sim's grappling (SimConfig.grapple) and the recognizer's grapple-only strike
 * rules (GestureRecognizer.grappleEnabled). To turn grappling on by default, make the absent parameter mean on here.
 */
export const GRAPPLE = params.has('grapple') && !['0', 'false', 'off'].includes(params.get('grapple') ?? '');
