import fc from 'fast-check'

/**
 * Property-based tests draw their inputs at random, which would make a red run
 * hard to reproduce and a green one hard to trust. Pinning the seed makes the
 * whole suite deterministic: the same 30 mazes are built on every machine and
 * every CI run, so a failure stays failing until it is fixed.
 *
 * To go looking for cases the fixed seed never reaches, pass another one:
 *
 *   FC_SEED=$RANDOM npm test
 *
 * fast-check prints the seed and the shrunk counterexample of a failing run, so
 * whatever that turns up can be pinned here or kept as a plain regression test.
 */
const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : 20260905

fc.configureGlobal({ seed, numRuns: 30 })
