/** Router classifier + continuous mode tests. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyTask, personaFor, coreFor, bandFor, testinessFor, parseMode, applyPersona,
  isFlashModel, extractText, sessionMode,
} from './preset/router-standard/router-core.mjs'
import { apply as applyBootstrap } from './preset/router-standard/router-bootstrap.mjs'

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

test('router-bootstrap: standard mode first turn uses personaFor and limits tools, then promotes', async () => {
  const events = []
  const ctx = {
    on(name, fn) {
      events.push({ name, fn })
    },
    effect(fn) {
      fn()
    },
    tools: {
      register() {}
    }
  }

  // Apply the plugin
  applyBootstrap(ctx, { routerMode: 'standard' })

  // Find the assemble hook
  const assembleHook = events.find((e) => e.name === 'system-prompt/assemble').fn

  // Mock session and assembly
  const session = {
    id: 'test-session-1',
    events: [
      { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '开发一个小游戏' }] } }
    ]
  }
  const agent = {
    session,
    options: { model: 'deepseek-v4-flash' }
  }
  const context = { agent }
  const assembly = {
    sections: [{ name: 'persona', text: 'You are an engineer.', order: 0 }],
    tools: [
      { name: 'pwsh' },
      { name: 'str_replace_editor' },
      { name: 'read' },
      { name: 'write' }
    ]
  }

  const next = async () => assembly

  // First turn: not promoted
  const res1 = await assembleHook(assembly, context, next)
  // Tool should be restricted to shell (pwsh) + str_replace_editor
  const toolNames1 = res1.tools.map((t) => t.name)
  assert.deepEqual(toolNames1.sort(), ['pwsh', 'str_replace_editor'].sort())
  // Persona should be task-aware, which is REACT_PERSONA since it is "开发一个小游戏"
  const personaSection1 = res1.sections.find((s) => s.name === 'router-persona')
  assert.ok(personaSection1.text.includes('hands-on'))

  // Mock a persistent signal (assistant response)
  session.events.push({ type: 'assistant/message', data: {} })

  // Second turn: promoted
  const res2 = await assembleHook(assembly, context, next)
  // Full tools returned
  const toolNames2 = res2.tools.map((t) => t.name)
  assert.deepEqual(toolNames2.sort(), ['pwsh', 'str_replace_editor', 'read', 'write'].sort())
})

test('router-bootstrap: step-by-step guidance chooses correct guide based on round and complexity', async () => {
  const events = []
  const ctx = {
    on(name, fn) {
      events.push({ name, fn })
    },
    effect(fn) { fn() },
    tools: { register() {} },
    get(name) { return undefined }
  }

  applyBootstrap(ctx, { routerMode: 'standard' })

  const eventHook = events.find((e) => e.name === 'session/event').fn

  const appendCalls = []
  const session = {
    id: 'test-session-2',
    events: []
  }
  const agent = {
    session,
    inbox: {
      append(type, msg) {
        appendCalls.push({ type, msg })
      }
    }
  }
  ctx.get = (name) => name === 'agent' ? agent : undefined

  // 1. Simple task, round 1
  const userMsg1 = {
    type: 'user/message',
    id: 'msg-1',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'hello' }]
    }
  }
  session.events.push(userMsg1)
  eventHook(session, userMsg1)
  assert.equal(appendCalls.length, 1)
  assert.ok(appendCalls[0].msg.content[0].text.includes('Think deeply first, then act.'))

  // 2. Simple task, round 3
  const userMsg2 = {
    type: 'user/message',
    id: 'msg-2',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'next step' }]
    }
  }
  const userMsg3 = {
    type: 'user/message',
    id: 'msg-3',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: 'more work' }]
    }
  }
  session.events.push(userMsg2)
  session.events.push(userMsg3)
  eventHook(session, userMsg3)
  assert.equal(appendCalls.length, 2)
  assert.ok(appendCalls[1].msg.content[0].text.includes('this is a new round. Re-classify'))

  // 3. Complex task
  const userMsgComplex = {
    type: 'user/message',
    id: 'msg-4',
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: '帮我重构这个模块，并进行全面详细的设计和系统优化' }]
    }
  }
  session.events.push(userMsgComplex)
  eventHook(session, userMsgComplex)
  assert.equal(appendCalls.length, 3)
  assert.ok(appendCalls[2].msg.content[0].text.includes('architecture, edge cases'))
})
