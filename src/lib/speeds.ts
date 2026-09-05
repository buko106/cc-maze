export interface SpeedEntry {
  readonly id: string
  readonly name: string
  /** Steps to take per frame. Infinity means "do not animate, just finish". */
  readonly stepsPerFrame: number
}

/** Adding one line here is enough to add a choice to the UI. */
export const speeds: readonly SpeedEntry[] = [
  { id: 'slow', name: 'ゆっくり', stepsPerFrame: 2 },
  { id: 'fast', name: '早く', stepsPerFrame: 20 },
  { id: 'instant', name: '一気に', stepsPerFrame: Infinity },
]

/** What the app starts on, and what a stored id that no longer exists falls back to. */
export const DEFAULT_SPEED_ID = 'fast'

export function getSpeed(id: string): SpeedEntry {
  return speeds.find((entry) => entry.id === id) ?? speeds[0]
}
