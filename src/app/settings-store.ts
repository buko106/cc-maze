import { Service, computed, effect, signal } from '@angular/core'
import { getAlgorithm } from '../lib/maze/algorithms'
import { getPlacement } from '../lib/maze/placements'
import { getSolver } from '../lib/maze/solvers'
import { loadSettings, saveSettings } from '../lib/settings/storage'
import { getSpeed } from '../lib/speeds'

/**
 * Everything the panel drives, as one signal, restored from the last visit and
 * written back on every change. What each setting means, what it may hold and
 * what it starts at lives in lib/settings/schema.ts.
 */
@Service()
export class SettingsStore {
  /**
   * The panel's form writes straight into this. Every change replaces the whole
   * object rather than mutating it, so anything reading one field sees it move.
   */
  readonly settings = signal(loadSettings())

  // The registry entries the stored ids point at
  readonly algorithm = computed(() => getAlgorithm(this.settings().algorithmId))
  readonly solver = computed(() => getSolver(this.settings().solverId))
  readonly placement = computed(() => getPlacement(this.settings().placementId))
  readonly speed = computed(() => getSpeed(this.settings().speedId))
  readonly solveSpeed = computed(() => getSpeed(this.settings().solveSpeedId))

  /** Nothing to run: the person traces the route on the maze instead. */
  readonly byHand = computed(() => !this.solver().run)

  constructor() {
    const restored = this.settings()
    effect(() => {
      const values = this.settings()
      // The first run is the panel being set up, not a choice anyone made. Saving
      // then would pin a visitor who touched nothing to today's defaults, and the
      // defaults are meant to stay free to change.
      if (values !== restored) saveSettings(values)
    })
  }
}
