import { findByIds } from 'usb'

const VENDOR_ID = 0x1532
const PRODUCT_ID = 0x0067
const INTERFACE_NUMBER = 2
const REPORT_LENGTH = 90

const device = findByIds(VENDOR_ID, PRODUCT_ID)
if (!device) {
  console.error('FAIL: Razer Naga Trinity 1532:0067 not found')
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

const setCrc = (data) => {
  let value = 0
  for (let index = 2; index < 88; index += 1) value ^= data[index]
  data[88] = value
  return data
}

const send = (data) =>
  new Promise((resolve, reject) => {
    device.controlTransfer(
      0x21,
      0x09,
      0x0300,
      INTERFACE_NUMBER,
      setCrc(data),
      (error) => (error ? reject(error) : resolve()),
    )
  })

const release = (iface) =>
  new Promise((resolve, reject) => {
    iface.release(true, (error) => (error ? reject(error) : resolve()))
  })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let iface
let detached = false
let claimed = false

try {
  device.open()
  iface = device.interfaces.find(
    (candidate) => candidate.interfaceNumber === INTERFACE_NUMBER,
  )
  if (!iface) throw new Error('USB interface 2 was not found')

  if (iface.isKernelDriverActive()) {
    console.log('Temporarily detaching usbhid from interface 2...')
    iface.detachKernelDriver()
    detached = true
  }

  iface.claim()
  claimed = true

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

  console.log('PASS: volatile blue RGB reports completed')
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : error)
  process.exitCode = 3
} finally {
  if (iface && claimed) {
    try {
      await release(iface)
    } catch (error) {
      console.error(
        'WARNING: interface release failed:',
        error instanceof Error ? error.message : error,
      )
    }
  }

  if (iface && detached) {
    try {
      iface.attachKernelDriver()
      console.log('RESTORED: usbhid reattached to interface 2')
    } catch (error) {
      console.error(
        'WARNING: automatic reattach failed; unplug and reconnect the mouse:',
        error instanceof Error ? error.message : error,
      )
      process.exitCode = 4
    }
  }

  try {
    device.close()
  } catch {
    // Ignore close after an earlier open failure.
  }
}
