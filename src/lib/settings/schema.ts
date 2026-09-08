import { algorithms } from '../maze/algorithms'
import { placements } from '../maze/placements'
import { solvers } from '../maze/solvers'
import { DEFAULT_SPEED_ID, speeds } from '../speeds'
import { choice, integer, type Range, type SettingsOf, type SettingsSchema } from './fields'

/**
 * A phone held upright starts with a smaller maze: at that width 28x20 leaves
 * cells about 10px across, too small to tell the search colours apart. Roughly
 * square, because the strip the maze is pinned into is about as wide as it is
 * tall -- a portrait maze would leave the sides empty.
 * The breakpoint has to stay in step with the one in App.svelte's stylesheet.
 * Guarded because the tests import this module without a DOM.
 */
const NARROW = typeof window !== 'undefined' && window.matchMedia('(max-width: 780px)').matches

/** Slider bounds. Shared with the sliders themselves, so the two cannot drift apart. */
export const COLS: Range = { min: 5, max: 90 }
export const ROWS: Range = { min: 5, max: 70 }
export const BRAID: Range = { min: 0, max: 100 }

/** Registries all look alike from here: a list of entries carrying an id. */
function ids(entries: readonly { readonly id: string }[]): readonly string[] {
  return entries.map((entry) => entry.id)
}

/**
 * Every setting the app remembers, in one place. Adding one is a line here and
 * the control that drives it; restoring, validating and saving follow along on
 * their own, and a payload written before the line existed keeps working.
 */
export const SETTINGS = {
  algorithmId: choice(ids(algorithms), algorithms[0].id),
  solverId: choice(ids(solvers), solvers[0].id),
  placementId: choice(ids(placements), placements[0].id),
  cols: integer(COLS, NARROW ? 18 : 28),
  rows: integer(ROWS, NARROW ? 18 : 20),
  braidPercent: integer(BRAID, 0),
  speedId: choice(ids(speeds), DEFAULT_SPEED_ID),
  solveSpeedId: choice(ids(speeds), DEFAULT_SPEED_ID),
} satisfies SettingsSchema

export type Settings = SettingsOf<typeof SETTINGS>
