import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core'

/**
 * Zone.js is not loaded at all. Change detection is scheduled by signals and
 * template events alone -- the default since Angular 21 -- which is what lets
 * the animation loop run outside of any zone without anything to opt out of.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners()],
}
