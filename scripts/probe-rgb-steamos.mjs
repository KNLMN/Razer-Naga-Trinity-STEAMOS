import { findByIds } from 'usb'

const VENDOR_ID = 0x1532
const PRODUCT_ID = 0x0067
const REPORT_LENGTH = 90
const ifaceArg = process.argv.find((arg) => arg.startsWith('--interface='))
const interfaceNumber = Number(ifaceArg?.split('=')[1])

if (![0, 1, 2].includes(interfaceNumber)) {
  console.error('Usage: node scripts/probe-rgb-steamos.mjs --interface=0')
  process.exit(1)
}

const device = findByIds(VENDOR_ID, PRODUCT_ID)
if (!device) {
  console.error('Razer Naga Trinity 1532:0067 not found')
  process.exit(2)
}

const report = (commandClass, commandId, dataSize, transactionId) => {
  const data = Buffer.alloc(REPORT_LENGTH)
  data[1] = transactionId
  data[5] = dataSize
  data[6] = commandClass
  data[7] = commandId
  return data
}

const crc = (data) => {
  let value = 0
  for (let index = 2; index < 88; index += 1) value ^= data[index]
  data[88] = value
  return data
}

const send = (data) =>
  new Promise((resolve, reject) => {
    device.controlTransfer(0x21, 0x09, 0x0300, interfaceNumber, crc(data), (error) => {
      if (error) reject(error)
      else resolve()
    })
  })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  device.open()
  console.log(`Testing volatile blue RGB through HID interface ${interfaceNumber}`)

  const brightness = report(0x0f, 0x04, 0x03, 0x3f)
  brightness[8] = 0x01
  brightness[9] = 0x00
  brightness[10] = 0xff
  await send(brightness)
  await wait(30)

  const switcher = report(0x0f, 0x02, 0x06, 0x1f)
  switcher[10] = 0x08
  await send(switcher)
  await wait(30)

  const staticBlue = report(0x0f, 0x03, 0x0e, 0x1f)
  staticBlue[12] = 0x02
  for (const offset of [13, 16, 19]) {
    staticBlue[offset] = 0x00
    staticBlue[offset + 1] = 0x66
    staticBlue[offset + 2] = 0xff
  }
  await send(staticBlue)

  console.log(`PASS: transfers completed on interface ${interfaceNumber}`)
  console.log('Check whether the physical logo and wheel turned blue.')
} catch (error) {
  console.error(`FAIL on interface ${interfaceNumber}:`, error instanceof Error ? error.message : error)
  process.exitCode = 3
} finally {
  try {
    device.close()
  } catch {
    // Ignore close after a failed open.
  }
}
