/**
 * scripts/smoke-e2e.ts
 *
 * Basic end-to-end smoke runner:
 * 1) Start local WS relay.
 * 2) Start Vite dev server.
 * 3) Send protocol-valid WS messages using run-demo-show (fast mode).
 * 4) Verify both services remain healthy (no crash).
 *
 * Usage:
 *   npm run smoke:e2e
 *   npm run smoke:e2e -- --seed --debug
 *
 * Options:
 *   --host        127.0.0.1   host for dev server and relay
 *   --dev-port    5173        Vite dev server port
 *   --ws-port     8088        WS relay port
 *   --seed                    pass through to run-demo-show.ts
 *   --debug                   stream child process logs
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

type ManagedProcess = {
  name: string
  cmd: string
  args: string[]
  child: ReturnType<typeof spawn>
  outputTail: string[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const viteBin = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')

const argv = process.argv.slice(2)

const readArg = (name: string): string | undefined => {
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  const nextValue = argv[index + 1]
  if (!nextValue || nextValue.startsWith('--')) return undefined
  return nextValue
}

const hasFlag = (name: string): boolean => argv.includes(name)

const bindHost = readArg('--host') ?? '127.0.0.1'
const devPort = Number(readArg('--dev-port') ?? '5173')
const wsPort = Number(readArg('--ws-port') ?? '8088')
const debug = hasFlag('--debug')
const seed = hasFlag('--seed')

if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65535) {
  throw new Error(`Invalid --dev-port value: ${devPort}`)
}

if (!Number.isInteger(wsPort) || wsPort < 1 || wsPort > 65535) {
  throw new Error(`Invalid --ws-port value: ${wsPort}`)
}

const normalizeConnectHost = (value: string): string => {
  if (value === '0.0.0.0') return '127.0.0.1'
  if (value === '::') return '::1'
  return value
}

const formatUrlHost = (value: string): string =>
  value.includes(':') && !value.startsWith('[') && !value.endsWith(']') ? `[${value}]` : value

const connectHost = normalizeConnectHost(bindHost)
const wsUrl = `ws://${formatUrlHost(connectHost)}:${wsPort}`
const devUrl = `http://${formatUrlHost(connectHost)}:${devPort}`

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const addOutput = (tail: string[], text: string) => {
  if (!text) return
  const lines = text
    .replaceAll('\r\n', '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    tail.push(line)
    if (tail.length > 80) {
      tail.shift()
    }
  }
}

const renderTail = (tail: string[]): string => {
  if (tail.length === 0) return '(no output captured)'
  return tail.slice(-20).join('\n')
}

const startProcess = (opts: {
  name: string
  cmd: string
  args: string[]
  env?: Record<string, string>
}): ManagedProcess => {
  const child = spawn(opts.cmd, opts.args, {
    cwd: repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const managed: ManagedProcess = {
    name: opts.name,
    cmd: opts.cmd,
    args: opts.args,
    child,
    outputTail: [],
  }

  child.stdout?.on('data', (chunk) => {
    const text = String(chunk)
    addOutput(managed.outputTail, text)
    if (debug) {
      process.stdout.write(`[${managed.name}] ${text}`)
    }
  })

  child.stderr?.on('data', (chunk) => {
    const text = String(chunk)
    addOutput(managed.outputTail, text)
    if (debug) {
      process.stderr.write(`[${managed.name}] ${text}`)
    }
  })

  child.on('error', (error) => {
    addOutput(managed.outputTail, `process error: ${String(error)}`)
  })

  return managed
}

const assertRunning = (proc: ManagedProcess) => {
  if (proc.child.exitCode !== null) {
    throw new Error(
      `${proc.name} exited early with code ${proc.child.exitCode}\n` +
      `Command: ${proc.cmd} ${proc.args.join(' ')}\n` +
      `Output tail:\n${renderTail(proc.outputTail)}`
    )
  }
}

const waitForHttpReady = async (proc: ManagedProcess, url: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    assertRunning(proc)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1200) })
      if (response.ok) {
        return
      }
    } catch {
      // keep polling
    }
    await delay(250)
  }

  throw new Error(
    `Timed out waiting for HTTP readiness at ${url}\n` +
    `Output tail:\n${renderTail(proc.outputTail)}`
  )
}

const probeWebSocket = async (url: string): Promise<boolean> => {
  if (!globalThis.WebSocket) {
    throw new Error('WebSocket is not available in this Node runtime (requires Node 22+)')
  }

  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => {
      ws.close()
      resolve(false)
    }, 800)

    const finish = (result: boolean) => {
      clearTimeout(timer)
      ws.removeEventListener('open', onOpen)
      ws.removeEventListener('error', onError)
      resolve(result)
    }

    const onOpen = () => {
      ws.close()
      finish(true)
    }

    const onError = () => finish(false)

    ws.addEventListener('open', onOpen, { once: true })
    ws.addEventListener('error', onError, { once: true })
  })
}

const waitForWebSocketReady = async (proc: ManagedProcess, url: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    assertRunning(proc)
    const ok = await probeWebSocket(url)
    if (ok) {
      return
    }
    await delay(250)
  }

  throw new Error(
    `Timed out waiting for WS readiness at ${url}\n` +
    `Output tail:\n${renderTail(proc.outputTail)}`
  )
}

const runCommand = async (opts: {
  name: string
  cmd: string
  args: string[]
  timeoutMs: number
  env?: Record<string, string>
}): Promise<void> => {
  const proc = startProcess({
    name: opts.name,
    cmd: opts.cmd,
    args: opts.args,
    env: opts.env,
  })

  const waitForChildExit = async (
    timeoutMs: number
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null } | null> =>
    new Promise((resolve) => {
      if (proc.child.exitCode !== null) {
        resolve({ code: proc.child.exitCode, signal: proc.child.signalCode })
        return
      }

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timer)
        proc.child.off('exit', onExit)
        resolve({ code, signal })
      }

      const timer = setTimeout(() => {
        proc.child.off('exit', onExit)
        resolve(null)
      }, timeoutMs)

      proc.child.on('exit', onExit)
    })

  const exitResult = await waitForChildExit(opts.timeoutMs)
  if (!exitResult) {
    if (proc.child.exitCode === null) {
      proc.child.kill('SIGTERM')
    }

    const termResult = await waitForChildExit(3000)
    if (!termResult && proc.child.exitCode === null) {
      proc.child.kill('SIGKILL')
      await waitForChildExit(3000)
    }

    throw new Error(
      `${opts.name} timed out after ${opts.timeoutMs}ms\n` +
      `Output tail:\n${renderTail(proc.outputTail)}`
    )
  }

  if (exitResult.code !== 0) {
    throw new Error(
      `${opts.name} failed (code=${String(exitResult.code)}, signal=${String(exitResult.signal)})\n` +
      `Command: ${opts.cmd} ${opts.args.join(' ')}\n` +
      `Output tail:\n${renderTail(proc.outputTail)}`
    )
  }
}

const waitForExit = async (proc: ManagedProcess, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      return true
    }
    await delay(100)
  }
  return proc.child.exitCode !== null
}

const stopProcess = async (proc: ManagedProcess) => {
  if (proc.child.exitCode !== null) {
    return
  }

  proc.child.kill('SIGTERM')
  const exitedGracefully = await waitForExit(proc, 3000)
  if (exitedGracefully) {
    return
  }

  proc.child.kill('SIGKILL')
  await waitForExit(proc, 3000)
}

async function run(): Promise<void> {
  console.log(`smoke:e2e starting`)
  console.log(`- bind host:  ${bindHost}`)
  console.log(`- dev server: ${devUrl}`)
  console.log(`- ws relay:   ${wsUrl}`)

  const relay = startProcess({
    name: 'ws-relay',
    cmd: process.execPath,
    args: [
      '--experimental-strip-types',
      'scripts/ws-relay.ts',
      '--host',
      bindHost,
      '--port',
      String(wsPort),
    ],
  })

  const dev = startProcess({
    name: 'vite-dev',
    cmd: process.execPath,
    args: [
      viteBin,
      '--host',
      bindHost,
      '--port',
      String(devPort),
      '--strictPort',
    ],
    env: {
      VITE_WS_URL: wsUrl,
    },
  })

  try {
    await waitForWebSocketReady(relay, wsUrl, 20000)
    await waitForHttpReady(dev, devUrl, 30000)
    console.log('services ready')

    const demoArgs = [
      '--experimental-strip-types',
      'scripts/run-demo-show.ts',
      '--ws',
      wsUrl,
      '--fast',
    ]
    if (seed) {
      demoArgs.push('--seed')
    }

    await runCommand({
      name: 'run-demo-show',
      cmd: process.execPath,
      args: demoArgs,
      timeoutMs: 90000,
    })

    await delay(500)
    assertRunning(relay)
    assertRunning(dev)
    await waitForHttpReady(dev, devUrl, 5000)

    console.log('smoke:e2e passed (dev server and relay remained healthy)')
  } finally {
    await stopProcess(dev)
    await stopProcess(relay)
  }
}

run().catch((error) => {
  console.error('smoke:e2e failed')
  console.error(error)
  process.exitCode = 1
})
