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
import * as bootstrapNs from './preset/router-standard/router-bootstrap.mjs'

function makeHarness() {
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

test('bootstrap listener survives user messages (extractText import present)', async () => {
  // Session A: first message is COMPLEX → firstUserText captured → band=spec
  // → strong modes need no guidance, but the listener must not crash.
  const h = makeHarness()
  h.ctx.get = (key) => (key === 'agent' ? h.agents[0] : undefined)
  // re-point agents map via assemble path (as real assembly does)
  await h.listeners['system-prompt/assemble']({ sections: [], tools: [{ name: 'bash' }] }, { agent: h.agents[0] }, async () => ({ sections: [], tools: [{ name: 'bash' }] }))
  assert.doesNotThrow(() => h.emit(h.sessions[0], '修复 parse_config 崩溃'))
  assert.equal(h.appended.filter((a) => a.session === 'smoke-a').length, 0, 'spec band: no guidance appended')

  // Session B: first message is SIMPLE → weak band → GUIDE_WEAK appended.
  h.ctx.get = (key) => (key === 'agent' ? h.agents[1] : undefined)
  await h.listeners['system-prompt/assemble']({ sections: [], tools: [{ name: 'bash' }] }, { agent: h.agents[1] }, async () => ({ sections: [], tools: [{ name: 'bash' }] }))
  assert.doesNotThrow(() => h.emit(h.sessions[1], '今天天气怎么样'))
  const guides = h.appended.filter((a) => a.session === 'smoke-b' && a.type === 'next-step')
  assert.equal(guides.length, 1, 'weak band: exactly one guidance appended')
  assert.match(guides[0].msg.content[0].text, /Router: classify this task/)
  assert.match(guides[0].msg.id, /^router-guide-/)
})
