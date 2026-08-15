/** Router classifier + continuous mode tests. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyTask, personaFor, coreFor, bandFor, testinessFor, parseMode, applyPersona,
  isFlashModel, extractText, sessionMode,
} from './preset/router-core.mjs'

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

// ── router-bootstrap 插件本体回归（weak 引导路径） ────────────────────────
// 回归背景：v0.1.1 的 import 列表漏掉 bandOf，session/event 处理器在
// L107 调用它 → 有活跃 agent 时每条真实用户消息都抛 ReferenceError，
// weak 近距离引导（P14-P20）完全不工作。以下测试直接挂载插件本体。
import { apply as applyBootstrap } from './preset/router-bootstrap.mjs'

/** 最小 cordis ctx mock：只实现插件用到的方法。 */
function makeCtx() {
  const handlers = {}
  return {
    handlers,
    on: (event, fn) => { (handlers[event] ??= []).push(fn) },
    get: () => undefined,
    effect: (fn) => fn(),
    tools: { register: () => {} },
    llm: {},
    logger: { warn: () => {} },
  }
}

function userMessageEvent(text) {
  return { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
}

test('weak-mode user message appends guidance without throwing (bandOf import)', async () => {
  const ctx = makeCtx()
  applyBootstrap(ctx, {})
  const session = { id: 's-weak', events: [userMessageEvent('随便聊聊今天的情况')] } // 无关键词 → weak
  const inbox = []
  ctx.get = () => ({ session, inbox: { append: (_queue, msg) => inbox.push(msg) } })
  for (const fn of ctx.handlers['session/event']) await fn(session, session.events[0])
  assert.equal(inbox.length, 1, 'weak message must append exactly one guidance message')
  assert.match(inbox[0].content[0].text, /Router: classify this task/)
})

test('strong-mode user message skips guidance without throwing (bandOf import)', async () => {
  const ctx = makeCtx()
  applyBootstrap(ctx, {})
  const session = { id: 's-spec', events: [userMessageEvent('修复这个仓库里的 bug')] } // spec → 不该有引导
  const inbox = []
  ctx.get = () => ({ session, inbox: { append: (_queue, msg) => inbox.push(msg) } })
  for (const fn of ctx.handlers['session/event']) await fn(session, session.events[0])
  assert.equal(inbox.length, 0, 'strong modes need no guidance')
})
