/**
 * skill-defer: defer the durable skill catalog past the first thinking.
 *
 * Why: `dsh-tool-skill` publishes its `<available_skills>` catalog message on
 * EVERY `agent/pre-step`, including the pristine first request — and the
 * router presets filter only the first-turn TOOL set, not this message, so the
 * RL-aligned first prompt still carried the whole catalog.
 *
 * This plugin sits on the same `agent/pre-step` waterfall, registered BEFORE
 * `tool-skill` (which makes it the OUTERMOST listener: its `next()` runs the
 * catalog append, then it sees the fully processed decision and strips).
 *
 * While the session has produced no model output yet (no `assistant/message`
 * and no `tool/call` — i.e. the first thinking has not ended), the
 * `skill-catalog` message is removed from the step's messages, so it never
 * reaches the model NOR the durable transcript. Once the first response
 * exists, the catalog is allowed through and `dsh-tool-skill` republishes it
 * on the next step, exactly like the router already opens the full tool
 * catalog after the first tool call.
 *
 * Rollback: set `deferSkillCatalog: false` on this row (leaves the restive
 * behavior off, everything else untouched), or delete the row and this file.
 * The preset's router core is not modified.
 *
 * Zero external imports on purpose (same rule as router-bootstrap): preset
 * rows resolve bare specifiers from the user home, where @deepseek-ai/* is
 * not installed.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'skill-defer'

/** The durable skill-catalog message source kind (dsh-tool-skill). */
const SKILL_CATALOG_SOURCE_KIND = 'skill-catalog'

/** True once the model produced its first response: first thinking has ended.
 *  A pre-first-step brand-new session has neither event; any later step has
 *  at least one. Pure + exported for deterministic unit tests. */
export function hasModelOutput(session) {
  if (!session || !Array.isArray(session.events)) return false
  return session.events.some(
    (event) => event?.type === 'assistant/message' || event?.type === 'tool/call',
  )
}

/** Filter the durable skill-catalog message out of a step's messages. */
export function stripSkillCatalog(messages) {
  return (messages ?? []).filter((message) => message?.source?.kind !== SKILL_CATALOG_SOURCE_KIND)
}

/**
 * Deferral decision: while `defer` is on and the session has no model output
 * yet, drop every `skill-catalog` message from the pre-step decision; once the
 * first thinking is over (or deferral is off), leave the decision untouched.
 * Pure + exported for deterministic unit tests.
 */
export function deferCatalog(decision, { defer = true, session } = {}) {
  if (!defer || decision?.kind !== 'enter') return decision
  if (hasModelOutput(session)) return decision
  const messages = stripSkillCatalog(decision.messages)
  if (messages.length === (decision.messages?.length ?? 0)) return decision
  return { ...decision, messages }
}

export function apply(ctx, config) {
  const defer = config?.deferSkillCatalog !== false
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    const stripped = deferCatalog(decision, { defer, session: payload?.agent?.session })
    if (stripped !== decision) {
      ctx.logger?.debug?.(`${name}: stripped skill catalog from pre-first-thinking step`)
    }
    return stripped
  })
}
