/**
 * router-bootstrap assemble-flow tests: the first-turn RL surface strips
 * sections/contexts/tools, and the promoted pass (after the first tool/call)
 * restores the FULL section set — the agent-instructions (AGENTS.md) section
 * must come back, per the "router stops touching anything" contract in
 * agent.cordis.yml and README.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { apply as applyRouterBootstrap } from './preset/router-standard/router-bootstrap-v1.mjs'

/** A minimal cordis ctx surface the plugin touches during apply(). */
function makeCtx() {
  const handlers = {}
  const registered = []
  const ctx = {
    on: (event, fn) => { handlers[event] = fn },
    get: () => undefined,
    effect: (fn) => { fn() },
    tools: { register: (tool) => { registered.push(tool.name) } },
    llm: { stream: async function* () {} },
  }
  return { ctx, handlers, registered }
}

/** Drive one system-prompt/assemble through the registered handler. */
async function assemble(ctx, handlers, sessionEvents, sections, tools) {
  const handler = handlers['system-prompt/assemble']
  assert.ok(handler, 'system-prompt/assemble handler registered')
  const assembled = { sections, tools, contexts: [{ kind: 'instructions' }] }
  const session = { id: 'test-session', events: sessionEvents }
  return handler(assembled, { agent: { session } }, async () => assembled)
}

test('standard mode registers the assemble handler and the dev_* tools', () => {
  const { ctx, handlers, registered } = makeCtx()
  applyRouterBootstrap(ctx, { routerMode: 'standard' })
  assert.ok(handlers['system-prompt/assemble'])
  assert.ok(handlers['session/event'])
  for (const name of ['dev_router_status', 'dev_router_mode', 'dev_mode_subagent']) {
    assert.ok(registered.includes(name), `${name} registered`)
  }
})

test('standard mode first turn: strips sections + contexts, keeps RL core tools only', async () => {
  const { ctx, handlers } = makeCtx()
  applyRouterBootstrap(ctx, { routerMode: 'standard' })
  const sections = [
    { name: 'identity', text: 'you are a sw engineer' },
    { name: 'agent-instructions', text: 'AGENTS.md content here' },
    { name: 'tool-guidance', text: 'use tools wisely' },
    { name: 'plan', text: 'plan mode rules' },
  ]
  const tools = [
    { name: 'read' }, { name: 'edit' }, { name: 'write' },
    { name: 'bash' }, { name: 'str_replace_editor' },
  ]
  const out = await assemble(ctx, handlers, [], sections, tools)
  // Only plan + router-persona survive the first turn.
  assert.deepEqual(out.sections.map((s) => s.name), ['plan', 'router-persona'])
  assert.equal(out.sections[1].text, 'You are a helpful software engineer assistant.')
  assert.deepEqual(out.contexts, [])
  // RL surface: shell + editor only.
  assert.deepEqual(out.tools.map((t) => t.name).sort(), ['bash', 'str_replace_editor'])
})

test('standard mode promoted: full section set restored, contexts still cleared', async () => {
  const { ctx, handlers } = makeCtx()
  applyRouterBootstrap(ctx, { routerMode: 'standard' })
  const sections = [
    { name: 'identity', text: 'you are a sw engineer' },
    { name: 'agent-instructions', text: 'AGENTS.md content here' },
    { name: 'tool-guidance', text: 'use tools wisely' },
  ]
  const tools = [{ name: 'read' }, { name: 'edit' }, { name: 'bash' }, { name: 'str_replace_editor' }]
  const out = await assemble(ctx, handlers, [{ type: 'tool/call' }], sections, tools)
  // The router stops touching the prompt: the ORIGINAL sections come back
  // (agent-instructions/AGENTS.md included), tools untouched, contexts cleared.
  assert.equal(out.sections, sections)
  assert.deepEqual(out.sections.map((s) => s.name), ['identity', 'agent-instructions', 'tool-guidance'])
  assert.equal(out.tools, tools)
  assert.deepEqual(out.contexts, [])
})

test('spec mode keeps every section on every turn (AGENTS.md stays visible)', async () => {
  const { ctx, handlers } = makeCtx()
  applyRouterBootstrap(ctx, { routerMode: 'spec' })
  const sections = [
    { name: 'identity', text: 'x' },
    { name: 'agent-instructions', text: 'AGENTS.md content here' },
  ]
  const tools = [{ name: 'read' }, { name: 'edit' }, { name: 'bash' }]
  // First turn (no tool/call yet): every section kept, router-persona appended.
  const first = await assemble(ctx, handlers, [], sections, tools)
  assert.ok(first.sections.some((s) => s.name === 'agent-instructions'), 'agent-instructions kept on first turn')
  assert.ok(first.sections.some((s) => s.name === 'identity'), 'identity kept on first turn')
  assert.ok(first.sections.some((s) => s.name === 'router-persona'), 'router-persona appended')
  // Promoted turn: everything kept.
  const promoted = await assemble(ctx, handlers, [{ type: 'tool/call' }], sections, tools)
  assert.equal(promoted.sections, sections)
})
