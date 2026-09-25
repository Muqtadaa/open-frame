/**
 * Whether this is a Mac, for the modifier a shortcut is shown and bound with.
 *
 * Here, in a leaf, so the object views can show a shortcut as well as the
 * interface does. The sniff was written three times once already and gathered
 * into the keymap; views may not reach the keymap, and a fourth copy is how one
 * would eventually disagree with the others.
 */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
