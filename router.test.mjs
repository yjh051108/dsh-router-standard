/** Router classifier + continuous mode tests. */
import assert from 'node:assert/strict'
import test from 'node:test'
// v0.2.0 split the single preset into router-standard / router-spec; both
// share the same router-core.mjs (byte-identical), so test against standard.
import {
  classifyTask, personaFor, coreFor, bandFor, testinessFor, parseMode, applyPersona,
  isFlashModel, extractText, sessionMode,
} from './preset/router-standard/router-core.mjs'

test('react: greenfield/build tasks map to react band', () => {
  assert.equal(bandFor(classifyTask('需要本地开发一个马里奥网页小游戏，参考经典原版')), 'react')
  assert.equal(bandFor(classifyTask('帮我写一个 Python 脚本处理 CSV')), 'react')
  assert.equal(bandFor(classifyTask('从零搭建一个网站')), 'react')
})

test('spec: maintenance/fix tasks map to spec band', () => {
  assert.equal(bandFor(classifyTask('修复这个仓库里的 bug')), 'spec')
  assert.equal(bandFor(classifyTask('为什么登录一直报错，帮我排查')), 'spec')
  assert.equal(classifyTask('修复这个仓库里的 bug'), 0)
})

test('mixed task lands in react band (net react keywords)', () => {
  assert.equal(bandFor(classifyTask('帮我开发一个小游戏然后修复里面的 bug')), 'react')
})

test('unmatched defaults to weak (internal routing)', () => {
  assert.equal(classifyTask('今天天气怎么样'), 'weak')
  assert.equal(bandFor('weak'), 'weak')
})

test('ties default to weak (internal routing)', () => {
  assert.equal(classifyTask('帮我开发一个小游戏然后修复里面的 bug'), 1) // net react wins
  assert.equal(classifyTask('开发并修复'), 'weak') // tie → weak
})

test('issue #1: plugin-generated nested user/message shape still classifies', () => {
  // 注入器 startIngest 的旧 seed 形状（data.message 嵌套）：提取必须解包，
  // 否则构建/修复任务误入 weak。
  const nested = { message: { kind: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '把目录里的内容内化成 DSH 插件并构建注入' }] } }
  assert.match(extractText(nested), /内化成/)
  assert.equal(bandFor(classifyTask(extractText(nested))), 'react')
  // 标准形状不受影响
  const flat = { kind: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '修复这个仓库里的 bug' }] }
  assert.equal(extractText(flat), '修复这个仓库里的 bug')
  assert.equal(bandFor(classifyTask(extractText(flat))), 'spec')
  // sessionMode 用首条 user/message（嵌套形状）
  const session = { events: [{ type: 'user/message', data: nested }] }
  assert.equal(sessionMode(session), 1)
})

test('weak persona is model-specific (P11/P24)', () => {
  const pro = personaFor('weak', 'deepseek-v4-pro')
  const flash = personaFor('weak', 'deepseek-v4-flash')
  assert.ok(pro.includes('decide the task type (build or fix)'))
  assert.ok(pro.includes('You are a helpful software engineer assistant.'))
  assert.ok(!pro.includes('review what you have already done')) // P24: anchors hurt Pro
  assert.ok(flash.includes('decide the task type (build or fix)'))
  assert.ok(flash.includes('review what you have already done')) // anchors help flash
  assert.notEqual(pro, flash)
  assert.equal(personaFor('weak', 'deepseek-v4-flash'), personaFor('weak', 'deepseek-v4-flash'))
  assert.equal(isFlashModel('deepseek-v4-flash'), true)
  assert.equal(isFlashModel('deepseek-v4-pro'), false)
})

test('parseMode accepts weak', () => {
  assert.equal(parseMode('weak'), 'weak')
  assert.equal(parseMode('router'), 'weak')
})

test('persona quantizes to three measured bands', () => {
  assert.equal(personaFor(0), 'You are a helpful software engineer assistant.')
  assert.equal(personaFor(0.1), 'You are a helpful software engineer assistant.')
  assert.ok(personaFor(0.3).includes('Work directly'))
  assert.ok(!personaFor(0.3).includes('test harnesses'))
  assert.ok(personaFor(1).includes('hands-on'))
  assert.ok(personaFor(1).includes('do not build test harnesses'))
})

test('core tool surface varies by band', () => {
  assert.deepEqual(coreFor(0), ['read', 'edit', 'glob', 'grep'])
  assert.deepEqual(coreFor(1), ['read', 'write', 'edit'])
  assert.deepEqual(coreFor(0.3), ['read', 'edit', 'write', 'glob', 'grep'])
})

test('band mapping matches the measured phase transition', () => {
  assert.equal(bandFor(0.1), 'spec') // stable spec region
  assert.equal(bandFor(0.2), 'mixed') // unstable band (display name)
  assert.equal(bandFor(0.4), 'mixed')
  assert.equal(bandFor(0.5), 'react') // stable react region
  assert.equal(bandFor(0.99), 'react')
})

test('testiness rises toward spec', () => {
  assert.equal(testinessFor(1), 'suppressed')
  assert.equal(testinessFor(0), 'normal')
  assert.equal(testinessFor(0.3), 'light')
})

test('parseMode accepts bands, percents, and decimals', () => {
  assert.equal(parseMode('spec'), 0)
  assert.equal(parseMode('react'), 1)
  assert.equal(parseMode('balanced'), 0.3)
  assert.equal(parseMode('70'), 0.7)
  assert.equal(parseMode('0.3'), 0.3)
  assert.equal(parseMode('auto'), 'auto')
  assert.equal(parseMode('nonsense'), null)
})

test('applyPersona replaces only the persona section (keeps plan-mode)', () => {
  const sections = [
    { name: 'harness-identity', text: 'x', order: -100 },
    { name: 'persona', text: 'old persona', order: 0 },
    { name: 'plan-mode', text: 'You are in plan mode.', order: -50 },
    { name: 'tool-guidance', text: 'y', order: 100 },
  ]
  const out = applyPersona(sections, 'new persona')
  const names = out.map((s) => s.name)
  assert.ok(names.includes('harness-identity'))
  assert.ok(names.includes('plan-mode'), 'plan-mode section must survive')
  assert.ok(names.includes('tool-guidance'))
  assert.ok(!names.includes('persona'), 'old persona section replaced')
  assert.equal(out.find((s) => s.name === 'router-persona').text, 'new persona')
})

test('applyPersona tolerates missing sections', () => {
  const out = applyPersona([], 'p')
  assert.deepEqual(out, [{ name: 'router-persona', text: 'p', order: 0 }])
})

// ── assembly smoke: bootstrap listener must SURVIVE a real user/message ────
// Regression for the missing-`extractText` import (bootstrap crashed at the
// first user message → firstUserText capture + near-field guidance silently
// dead). A minimal ctx harness replays the session/event path end-to-end.
// Both bootstrap variants are covered: v1 is the file the preset's
// agent.cordis.yml actually mounts; v2 ships alongside as the same code.
import * as bootstrapV1 from './preset/router-standard/router-bootstrap-v1.mjs'
import * as bootstrapV2 from './preset/router-standard/router-bootstrap.mjs'

function makeHarness(bootstrapNs) {
  const appended = []
  const sessionA = { id: 'smoke-a', events: [] }
  const sessionB = { id: 'smoke-b', events: [] }
  const agentA = { session: sessionA, options: { provider: 'p', model: 'deepseek-v4-flash' }, inbox: { append: (type, msg) => appended.push({ type, msg, session: sessionA.id }) } }
  const agentB = { session: sessionB, options: { provider: 'p', model: 'deepseek-v4-flash' }, inbox: { append: (type, msg) => appended.push({ type, msg, session: sessionB.id }) } }
  const listeners = {}
  const ctx = {
    on(event, cb) { listeners[event] = cb },
    get(key) {
      if (key === 'agent') return undefined // exercise the agents-map branch
      if (key === 'llm') return { stream: async function* () {} }
      return undefined
    },
    effect(fn) { fn() },
    tools: { register() {} },
  }
  bootstrapNs.apply(ctx, { routerMode: 'standard' })
  const emit = (session, text) => {
    session.events.push({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })
    listeners['session/event'](session, { type: 'user/message', data: session.events.at(-1).data })
  }
  return { ctx, listeners, emit, appended, agents: [agentA, agentB], sessions: [sessionA, sessionB] }
}

function runSmoke(bootstrapNs) {
  return async () => {
    // Session A: first message is COMPLEX → firstUserText captured → band=spec
    // → strong modes need no guidance, but the listener must not crash.
    const h = makeHarness(bootstrapNs)
    h.ctx.get = (key) => (key === 'agent' ? h.agents[0] : undefined)
    // re-point agents map via assemble path (as real assembly does)
    await h.listeners['system-prompt/assemble']({ sections: [], tools: [{ name: 'bash' }] }, { agent: h.agents[0] }, async () => ({ sections: [], tools: [{ name: 'bash' }] }))
    assert.doesNotThrow(() => h.emit(h.sessions[0], '修复 parse_config 崩溃'))
    await Promise.resolve() // let the deferred guide append (queueMicrotask) run
    assert.equal(h.appended.filter((a) => a.session === 'smoke-a').length, 0, 'spec band: no guidance appended')

    // Session B: first message is SIMPLE → weak band → GUIDE_WEAK appended.
    h.ctx.get = (key) => (key === 'agent' ? h.agents[1] : undefined)
    await h.listeners['system-prompt/assemble']({ sections: [], tools: [{ name: 'bash' }] }, { agent: h.agents[1] }, async () => ({ sections: [], tools: [{ name: 'bash' }] }))
    assert.doesNotThrow(() => h.emit(h.sessions[1], '今天天气怎么样'))
    await Promise.resolve() // let the deferred guide append (queueMicrotask) run
    const guides = h.appended.filter((a) => a.session === 'smoke-b' && a.type === 'next-step')
    assert.equal(guides.length, 1, 'weak band: exactly one guidance appended')
    assert.match(guides[0].msg.content[0].text, /Router: classify this task/)
    assert.match(guides[0].msg.id, /^router-guide-/)
  }
}

test('bootstrap v1 (mounted by agent.cordis.yml) listener survives user messages', runSmoke(bootstrapV1))
test('bootstrap v2 (ships alongside) listener survives user messages', runSmoke(bootstrapV2))

// ── absorbed upstream fixes: regression suite (PR #17 / #21 / #5) ─────────
// Each test is written against the CURRENT code first; it must FAIL before
// the fix is absorbed (proving the bug reproduces) and PASS after.

// T1: sessionMode must skip plugin-injected messages (PR #17.2)
test('sessionMode ignores plugin-injected user/message events (PR #17)', () => {
  const plugin = { type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: '技能目录注入：开发 12 个工具，构建 3 个新项目' }] } }
  const user = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '修复这个仓库里的 bug' }] } }
  assert.equal(sessionMode({ events: [plugin, user] }), 0, 'must classify the real user message, not the plugin text')
  assert.equal(sessionMode({ events: [plugin] }), 'weak', 'plugin-only transcript → weak')
})

// T2: agent/inbox/claimed captures the first real user text BEFORE assemble (PR #17.1)
function claimedHarness(config = {}) {
  const listeners = {}
  const ctx = {
    on(event, cb) { listeners[event] = cb },
    get(key) { if (key === 'llm') return { stream: async function* () {} }; return undefined },
    effect(fn) { fn() },
    tools: { register() {} },
  }
  bootstrapV1.apply(ctx, config)
  return { ctx, listeners }
}

test('claimed first-user text routes the FIRST assembly (PR #17.1)', async () => {
  const h = claimedHarness({ routerMode: 'spec' })
  const listeners = h.listeners
  const session = { id: 's-claimed', events: [] }
  const agent = { session, options: { provider: 'p', model: 'deepseek-v4-flash' } }
  assert.ok(listeners['agent/inbox/claimed'], 'claimed listener must be registered')
  listeners['agent/inbox/claimed']({ agent, message: { source: { kind: 'user' }, content: [{ type: 'text', text: '帮我开发一个马里奥网页小游戏' }] } })
  const out = await listeners['system-prompt/assemble'](
    {}, { agent },
    async () => ({ sections: [{ name: 'persona', text: 'x' }], tools: [{ name: 'bash' }], variables: { provider: 'p', model: 'deepseek-v4-flash' } }),
  )
  const persona = out.sections.find((s) => s.name === 'router-persona').text
  assert.ok(persona.includes('hands-on'), 'react task must get the react persona on the FIRST assembly')
})

test('claimed ignores plugin-injected messages (PR #17.1)', async () => {
  const h = claimedHarness({ routerMode: 'spec' })
  const session = { id: 's-claimed2', events: [] }
  const agent = { session, options: { provider: 'p', model: 'deepseek-v4-flash' } }
  h.listeners['agent/inbox/claimed']({ agent, message: { source: { kind: 'plugin' }, content: [{ type: 'text', text: '技能目录注入：开发 12 个工具' }] } })
  const out = await h.listeners['system-prompt/assemble'](
    {}, { agent },
    async () => ({ sections: [{ name: 'persona', text: 'x' }], tools: [{ name: 'bash' }], variables: { provider: 'p', model: 'deepseek-v4-flash' } }),
  )
  const persona = out.sections.find((s) => s.name === 'router-persona').text
  assert.ok(!persona.includes('do not build test harnesses'), 'plugin text must NOT route the session to react')
})

// T3: shell-less spawned subagents pass through untouched (PR #5)
test('assemble skips agents with a parentSession (PR #5)', async () => {
  const h = claimedHarness({ routerMode: 'spec' })
  const childAgent = {
    session: { id: 's-child', header: { parentSession: 's-parent' }, events: [] },
    options: { model: 'deepseek-v4-flash' },
  }
  const base = { sections: [{ name: 'persona', text: 'child persona' }], tools: [], variables: {} }
  const out = await h.listeners['system-prompt/assemble']({}, { agent: childAgent }, async () => base)
  assert.equal(out, base, 'child assembly must pass through untouched (no shell crash)')
})

// T4: weak persona follows the session-selected model (PR #21, issue #9)
const T4_BASE = {
  sections: [{ name: 'persona', text: 'old persona' }],
  tools: [{ name: 'bash' }, { name: 'read' }, { name: 'write' }, { name: 'edit' }, { name: 'glob' }, { name: 'grep' }, { name: 'str_replace_editor' }],
  contexts: [],
}
const T4_USER = { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '看看这个项目现在是什么情况。' }] } }
async function assembleWeakT4(variables, agentModel) {
  const h = claimedHarness({ routerMode: 'spec' })
  const agent = { session: { id: 's-model', events: [T4_USER] }, options: { model: agentModel } }
  return h.listeners['system-prompt/assemble']({}, { agent }, async () => ({ ...T4_BASE, variables }))
}
test('weak persona follows session-selected model, not agent.options (PR #21)', async () => {
  const out = await assembleWeakT4({ provider: 'opencode-go', model: 'deepseek-v4-flash' }, 'deepseek-v4-pro')
  const persona = out.sections.find((s) => s.name === 'router-persona').text
  assert.ok(persona.includes('review what you have already done'), 'should use the Flash weak persona')
  assert.ok(!persona.includes('You are a helpful software engineer assistant.'), 'should not use the Pro weak persona')
})
test('weak persona falls back to agent.options without session selection (PR #21)', async () => {
  const out = await assembleWeakT4(undefined, 'deepseek-v4-flash')
  const persona = out.sections.find((s) => s.name === 'router-persona').text
  assert.ok(persona.includes('review what you have already done'), 'flash fallback')
})
