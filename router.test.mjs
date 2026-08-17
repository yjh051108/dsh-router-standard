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


// ── plugin-level regression: contexts behavior across promotion (issue #7) ──
// v0.2.0 moved the bootstrap into preset/<mode>/router-bootstrap-v1.mjs. The
// promoted branch used to return `contexts: []`, permanently dropping the
// runtime-context snapshot (file policy / approval policy) after promotion.

import { apply } from './preset/router-standard/router-bootstrap-v1.mjs'

function makeHarness(config = {}) {
  const listeners = {}
  const ctx = {
    on(event, fn) { (listeners[event] ??= []).push(fn) },
    effect(fn) { fn() },
    get() { return undefined },
    llm: {},
    tools: { register() {} },
  }
  apply(ctx, config)
  return listeners
}

const ASSEMBLED = {
  sections: [{ name: 'persona', text: 'old persona' }],
  tools: [
    { name: 'bash' }, { name: 'read' }, { name: 'write' }, { name: 'edit' },
    { name: 'glob' }, { name: 'grep' }, { name: 'str_replace_editor' }, { name: 'web' },
  ],
  contexts: [
    { name: 'sandbox:policy', text: 'Current DSH file policy: workspace-write.' },
    { name: 'approval:policy', text: 'Approval policy: ask.' },
  ],
}

async function assemble(events, config) {
  const listeners = makeHarness(config)
  const agent = {
    session: { id: 's-contexts', events },
    options: { model: 'deepseek-v4-pro' },
  }
  return listeners['system-prompt/assemble'][0]({}, { agent }, async () => ASSEMBLED)
}

const FIRST_USER = {
  type: 'user/message',
  data: { kind: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '修复这个仓库里的 bug' }] },
}

test('spec mode first assembly clears runtime contexts and uses the legacy core', async () => {
  const out = await assemble([FIRST_USER], { routerMode: 'spec' })
  assert.deepEqual(out.contexts, [])
  assert.deepEqual(out.tools.map((t) => t.name).sort(), ['bash', 'edit', 'glob', 'grep', 'read'])
})

test('standard mode first assembly exposes the RL two-tool surface', async () => {
  const out = await assemble([FIRST_USER], { routerMode: 'standard' })
  assert.deepEqual(out.contexts, [])
  assert.deepEqual(out.tools.map((t) => t.name).sort(), ['bash', 'str_replace_editor'])
})

test('promoted assembly keeps runtime contexts (issue #7)', async () => {
  const out = await assemble([FIRST_USER, { type: 'tool/call' }], { routerMode: 'spec' })
  assert.deepEqual(out.contexts, ASSEMBLED.contexts)
  // promoted: full catalog exposed
  assert.equal(out.tools.length, ASSEMBLED.tools.length)
})
