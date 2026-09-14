#!/usr/bin/env python3
"""Temporary SteamOS remap test for the Naga Trinity 12-button side plate."""

import select
import signal
import sys

from evdev import InputDevice, UInput, ecodes

DEFAULT_DEVICE = (
    "/dev/input/by-id/"
    "usb-Razer_Razer_Naga_Trinity_00000000001A-if02-event-kbd"
)
SOURCE_CODES = [
    ecodes.KEY_1,
    ecodes.KEY_2,
    ecodes.KEY_3,
    ecodes.KEY_4,
    ecodes.KEY_5,
    ecodes.KEY_6,
    ecodes.KEY_7,
    ecodes.KEY_8,
    ecodes.KEY_9,
    ecodes.KEY_0,
    ecodes.KEY_MINUS,
    ecodes.KEY_EQUAL,
]
BUTTON_NAMES = {
    code: button for button, code in enumerate(SOURCE_CODES, start=1)
}
TEST_MAPPING = {ecodes.KEY_1: ecodes.KEY_A}


def main():
    device_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DEVICE

    try:
        source = InputDevice(device_path)
    except OSError as error:
        print(f"FAIL: cannot open side plate: {error}", file=sys.stderr)
        return 2

    capabilities = {
        ecodes.EV_KEY: sorted(set(SOURCE_CODES + list(TEST_MAPPING.values())))
    }

    try:
        output = UInput(
            capabilities,
            name="Naga Trinity SteamOS Virtual Side Plate",
            version=0x0001,
        )
    except OSError as error:
        source.close()
        print(f"FAIL: cannot create virtual keyboard: {error}", file=sys.stderr)
        return 3

    stopping = False

    def stop(_signal_number, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    print("Naga Trinity temporary remap active")
    print(f"Source: {device_path}")
    print("Side button 1 -> A")
    print("Side buttons 2-12 -> unchanged")
    print("Only the side-plate device is grabbed. Stop with Ctrl+C.")

    try:
        source.grab()
        while not stopping:
            readable, _, _ = select.select([source.fd], [], [], 0.25)
            if not readable:
                continue

            for event in source.read():
                if event.type != ecodes.EV_KEY or event.code not in BUTTON_NAMES:
                    continue

                output_code = TEST_MAPPING.get(event.code, event.code)
                output.write(ecodes.EV_KEY, output_code, event.value)
                output.syn()

                if event.value == 1:
                    output_name = ecodes.KEY[output_code]
                    print(
                        f"Button {BUTTON_NAMES[event.code]} -> {output_name}",
                        flush=True,
                    )
    except OSError as error:
        print(f"FAIL while remapping: {error}", file=sys.stderr)
        return 4
    finally:
        try:
            source.ungrab()
        except OSError:
            pass
        output.close()
        source.close()
        print("Remap stopped; the physical side plate is restored.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
