import { findByIds } from 'usb'

const VENDOR_ID = 0x1532
const PRODUCT_ID = 0x0067

const hex = (value) => `0x${value.toString(16).padStart(4, '0')}`
const device = findByIds(VENDOR_ID, PRODUCT_ID)

console.log('Naga Trinity SteamOS probe')
console.log(`Platform: ${process.platform} ${process.arch}`)
console.log(`Node: ${process.version}`)

if (!device) {
  console.error(`FAIL: device ${hex(VENDOR_ID)}:${hex(PRODUCT_ID)} not found`)
  process.exitCode = 2
} else {
  console.log(`Device: ${hex(device.deviceDescriptor.idVendor)}:${hex(device.deviceDescriptor.idProduct)}`)
  console.log(`USB location: bus ${device.busNumber}, address ${device.deviceAddress}`)

  try {
    device.open()
    const interfaces = device.interfaces.map((iface) => ({
      number: iface.interfaceNumber,
      endpoints: iface.endpoints.length,
      kernelDriverActive:
        typeof iface.isKernelDriverActive === 'function'
          ? iface.isKernelDriverActive()
          : 'unknown',
    }))
    console.log('Interfaces:', JSON.stringify(interfaces, null, 2))
    console.log('PASS: libusb can open the Naga as the current user')
  } catch (error) {
    console.error('FAIL: the device was found but libusb could not open it')
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 3
  } finally {
    try {
      device.close()
    } catch {
      // Device was not opened or was already closed.
    }
  }
}
