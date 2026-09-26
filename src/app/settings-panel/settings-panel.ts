import { Component, computed, inject } from '@angular/core'
import { FormField, disabled, form, max, min } from '@angular/forms/signals'
import { algorithms } from '../../lib/maze/algorithms'
import { placements } from '../../lib/maze/placements'
import { getSolver, solvers } from '../../lib/maze/solvers'
import { BRAID, COLS, ROWS } from '../../lib/settings/schema'
import { speeds } from '../../lib/speeds'
import { SettingsStore } from '../settings-store'

/**
 * Every control that picks how the maze is built and searched. The form is
 * bound straight to the stored settings, so choosing something here is all it
 * takes: the session reacts to the change, and the store remembers it.
 */
@Component({
  selector: 'app-settings-panel',
  imports: [FormField],
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.css',
})
export class SettingsPanel {
  private readonly store = inject(SettingsStore)

  protected readonly algorithms = algorithms
  protected readonly solvers = solvers
  protected readonly placements = placements
  protected readonly speeds = speeds

  protected readonly settings = this.store.settings
  /**
   * The slider bounds are the same ranges storage clamps to, so the sliders
   * cannot offer a value that would not survive being saved.
   */
  protected readonly form = form(this.settings, (path) => {
    min(path.cols, COLS.min)
    max(path.cols, COLS.max)
    min(path.rows, ROWS.min)
    max(path.rows, ROWS.max)
    min(path.braidPercent, BRAID.min)
    max(path.braidPercent, BRAID.max)
    // Solving by hand goes as fast as the pen does
    disabled(path.solveSpeedId, ({ valueOf }) => !getSolver(valueOf(path.solverId)).run)
  })

  protected readonly byHand = this.store.byHand
  protected readonly placement = this.store.placement
  protected readonly braided = computed(() => this.settings().braidPercent > 0)
  /** Set while a method that leans on a perfect maze is picked on a braided one. */
  protected readonly braidNote = computed(() =>
    this.braided() ? this.store.solver().braidNote : undefined,
  )
}
