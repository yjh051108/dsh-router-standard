/** Router classifier + continuous mode tests. */
import assert from 'node:assert/strict'
import test from 'node:test'
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

test('issue #13: sessionMode skips plugin-origin messages when pinning the band', () => {
  // 真实链路上首条落库的 user/message 常常是插件注入的（approval 通知、
  // runtime-context 快照、agent-instructions、router 引导），它们不能参与分类。
  const buildTask = { kind: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '从零开发一个马里奥网页游戏' }] }
  const approval = { kind: 'user', source: { kind: 'plugin', plugin: 'user-approval' }, content: [{ type: 'text', text: 'The approval policy changed from "ask" to "never"' }] }
  const snapshot = { kind: 'user', source: { kind: 'plugin', plugin: 'runtime-context' }, content: [{ type: 'text', text: 'cwd snapshot' }] }
  const guide = { id: 'router-guide-x', kind: 'user', source: { kind: 'plugin', plugin: 'router-bootstrap' }, content: [{ type: 'text', text: 'Router: classify this task now' }] }
  // 插件消息在前、真实用户消息在后 → 必须按真实消息分类（react）
  assert.equal(sessionMode({ events: [
    { type: 'user/message', data: approval },
    { type: 'user/message', data: snapshot },
    { type: 'user/message', data: guide },
    { type: 'user/message', data: buildTask },
  ] }), 1)
  // 只有插件消息 → 退化到首条 user/message（旧行为，不抛错）
  assert.equal(sessionMode({ events: [{ type: 'user/message', data: approval }] }), 'weak')
  // 无 source 的历史消息按用户消息处理
  const legacy = { kind: 'user', content: [{ type: 'text', text: '修复这个仓库里的 bug' }] }
  assert.equal(sessionMode({ events: [{ type: 'user/message', data: legacy }] }), 0)
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

// ── skill-defer: defer the durable skill catalog past the first thinking ──
import {
  deferCatalog, hasModelOutput, stripSkillCatalog,
} from './preset/router-standard/skill-defer.mjs'

function catalogMsg() {
  return { id: 'cat', source: { kind: 'skill-catalog', form: 'catalog', entries: [] }, content: [] }
}
function userMsg() {
  return { id: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] }
}
function invocationMsg() {
  return { id: 'inv', source: { kind: 'skill-invocation', name: 'x', form: 'instructions' }, content: [] }
}

test('hasModelOutput is false until the first model response', () => {
  assert.equal(hasModelOutput(undefined), false)
  assert.equal(hasModelOutput({}), false)
  assert.equal(hasModelOutput({ events: [] }), false)
  assert.equal(hasModelOutput({ events: [{ type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', data: {} }] }), false)
  assert.equal(hasModelOutput({ events: [{ type: 'assistant/chunk', data: {} }] }), false, 'stream chunks are not yet a response')
  assert.equal(hasModelOutput({ events: [{ type: 'assistant/message', data: {} }] }), true)
  assert.equal(hasModelOutput({ events: [{ type: 'tool/call', data: {} }] }), true)
})

test('stripSkillCatalog removes only the durable catalog message', () => {
  assert.deepEqual(stripSkillCatalog([catalogMsg(), userMsg(), invocationMsg()]), [userMsg(), invocationMsg()])
  assert.deepEqual(stripSkillCatalog([]), [])
  assert.deepEqual(stripSkillCatalog(undefined), [])
})

test('deferCatalog strips the catalog on the pristine first step', () => {
  const decision = { kind: 'enter', messages: [catalogMsg(), userMsg()] }
  const out = deferCatalog(decision, { defer: true, session: { events: [] } })
  assert.notEqual(out, decision)
  assert.deepEqual(out.messages.map((m) => m.id), ['user'])
})

test('deferCatalog keeps the catalog once the first thinking ended', () => {
  const decision = { kind: 'enter', messages: [catalogMsg(), userMsg()] }
  const out = deferCatalog(decision, { defer: true, session: { events: [{ type: 'assistant/message', data: {} }] } })
  assert.equal(out, decision, 'unchanged object after first response')
})

test('deferCatalog is a no-op with nothing to strip', () => {
  const decision = { kind: 'enter', messages: [userMsg()] }
  assert.equal(deferCatalog(decision, { defer: true, session: { events: [] } }), decision)
})

test('deferCatalog false restores old behavior (rollback path)', () => {
  const decision = { kind: 'enter', messages: [catalogMsg()] }
  assert.equal(deferCatalog(decision, { defer: false, session: { events: [] } }), decision)
})

test('deferCatalog leaves reject decisions untouched', () => {
  const decision = { kind: 'reject', reason: 'blocked' }
  assert.equal(deferCatalog(decision, { defer: true, session: { events: [] } }), decision)
})

test('skill-defer apply registers an agent/pre-step strip (outermost ordering)', async () => {
  const registered = []
  const fakeCtx = { on(event, handler) { registered.push({ event, handler }) }, logger: { debug() {} } }
  const mod = await import('./preset/router-standard/skill-defer.mjs')
  mod.apply(fakeCtx, { deferSkillCatalog: true })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].event, 'agent/pre-step')
  // next() = the inner chain (tool-skill's catalog append), which this
  // outermost listener must run BEFORE inspecting the decision.
  const pristine = { agent: { session: { events: [] } } }
  const first = await registered[0].handler(
    pristine,
    () => Promise.resolve({ kind: 'enter', messages: [catalogMsg(), userMsg()] }),
  )
  assert.deepEqual(first.messages.map((m) => m.id), ['user'])
  const responded = { agent: { session: { events: [{ type: 'assistant/message', data: {} }] } } }
  const second = await registered[0].handler(
    responded,
    () => Promise.resolve({ kind: 'enter', messages: [catalogMsg(), userMsg()] }),
  )
  assert.deepEqual(second.messages.map((m) => m.id), ['cat', 'user'])
})

