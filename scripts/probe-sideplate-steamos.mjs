import { createReadStream, existsSync } from 'node:fs'

const DEFAULT_DEVICE =
  '/dev/input/by-id/usb-Razer_Razer_Naga_Trinity_00000000001A-if02-event-kbd'
const devicePath = process.argv[2] ?? DEFAULT_DEVICE
const EVENT_SIZE = 24
const sideButtons = new Map([
  [2, 1],
  [3, 2],
  [4, 3],
  [5, 4],
  [6, 5],
  [7, 6],
  [8, 7],
  [9, 8],
  [10, 9],
  [11, 10],
  [12, 11],
  [13, 12],
])

if (process.platform !== 'linux') {
  console.error('This probe only supports Linux evdev.')
  process.exit(1)
}

if (!existsSync(devicePath)) {
  console.error(`Side-plate device not found: ${devicePath}`)
  process.exit(2)
}

console.log('Naga Trinity side-plate probe')
console.log(`Device: ${devicePath}`)
console.log('This test is read-only and does not grab or suppress input.')
console.log('Press side buttons 1-12. Stop with Ctrl+C.')

const stream = createReadStream(devicePath, { highWaterMark: EVENT_SIZE * 16 })
let pending = Buffer.alloc(0)

stream.on('data', (chunk) => {
  pending = Buffer.concat([pending, chunk])

  while (pending.length >= EVENT_SIZE) {
    const event = pending.subarray(0, EVENT_SIZE)
    pending = pending.subarray(EVENT_SIZE)

    const type = event.readUInt16LE(16)
    const code = event.readUInt16LE(18)
    const value = event.readInt32LE(20)

    if (type !== 1 || !sideButtons.has(code)) continue

    const state = value === 0 ? 'UP' : value === 1 ? 'DOWN' : 'REPEAT'
    console.log(`Side button ${sideButtons.get(code)} ${state} (EV_KEY code ${code})`)
  }
})

stream.on('error', (error) => {
  console.error(`FAIL: ${error.message}`)
  process.exitCode = 3
})

process.on('SIGINT', () => {
  console.log('\nProbe stopped. No mappings were changed.')
  stream.close()
})
