import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import type { ApplyResult, NagaProfile } from './types'

let remapper: ChildProcessWithoutNullStreams | null = null

const scriptPath = () =>
  app.isPackaged
    ? join(process.resourcesPath, 'scripts', 'naga-remapper.py')
    : join(app.getAppPath(), 'scripts', 'naga-remapper.py')

export const stopLinuxRemapper = async () => {
  const child = remapper
  remapper = null
  if (!child || child.killed) return

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 1000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

export const applyLinuxProfile = async (
  profile: NagaProfile,
): Promise<ApplyResult> => {
  await stopLinuxRemapper()

  const bindings = Array.from({ length: 12 }, (_, index) => {
    const binding = profile.buttons.find((item) => item.id === `side-${index + 1}`)
    return {
      button: index + 1,
      action: binding?.action ?? 'default',
      value: binding?.value ?? '',
    }
  })

  return new Promise<ApplyResult>((resolve) => {
    const child = spawn('python3', [scriptPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    remapper = child
    let settled = false
    let output = ''

    const finish = (result: ApplyResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    const timeout = setTimeout(() => {
      void stopLinuxRemapper()
      finish({ ok: false, message: 'Linux remapper timed out while starting.' })
    }, 3000)

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes('READY')) {
        finish({
          ok: true,
          message: 'SteamOS profile activated. Side-button remapping is running.',
          stage: 'complete',
        })
      } else if (output.includes('ERROR:')) {
        void stopLinuxRemapper()
        finish({ ok: false, message: output.trim().replace(/^ERROR:/, '') })
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      console.error('[naga] Linux remapper:', chunk.toString().trim())
    })
    child.once('error', (error) => {
      remapper = null
      finish({ ok: false, message: error.message })
    })
    child.once('exit', (code) => {
      if (remapper === child) remapper = null
      if (!settled) {
        finish({
          ok: false,
          message: `Linux remapper exited before activation (code ${code ?? 'unknown'}).`,
        })
      }
    })

    child.stdin.end(JSON.stringify({ bindings }))
  })
}
