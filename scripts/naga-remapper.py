#!/usr/bin/env python3
"""SteamOS evdev/uinput remapper for the Naga Trinity side plate."""

import glob
import json
import select
import signal
import sys

from evdev import InputDevice, UInput, ecodes

DEVICE_GLOB = (
    "/dev/input/by-id/"
    "usb-Razer_Razer_Naga_Trinity_*-if02-event-kbd"
)
SOURCE_CODES = [
    ecodes.KEY_1, ecodes.KEY_2, ecodes.KEY_3, ecodes.KEY_4,
    ecodes.KEY_5, ecodes.KEY_6, ecodes.KEY_7, ecodes.KEY_8,
    ecodes.KEY_9, ecodes.KEY_0, ecodes.KEY_MINUS, ecodes.KEY_EQUAL,
]
ALIASES = {
    "ESC": "ESC", "ESCAPE": "ESC", "RETURN": "ENTER",
    "SPACEBAR": "SPACE", "PGUP": "PAGEUP", "PGDN": "PAGEDOWN",
    "-": "MINUS", "=": "EQUAL", "[": "LEFTBRACE", "]": "RIGHTBRACE",
    "\\": "BACKSLASH", ";": "SEMICOLON", "'": "APOSTROPHE",
    ",": "COMMA", ".": "DOT", "/": "SLASH", "`": "GRAVE",
}


def resolve_key(value):
    normalized = str(value).strip().upper().replace(" ", "_")
    normalized = ALIASES.get(normalized, normalized)
    if len(normalized) == 1 and normalized.isalnum():
        normalized = normalized
    name = normalized if normalized.startswith("KEY_") else f"KEY_{normalized}"
    code = ecodes.ecodes.get(name)
    if not isinstance(code, int):
        raise ValueError(f"unsupported key: {value}")
    return code


def find_device():
    matches = sorted(glob.glob(DEVICE_GLOB))
    if not matches:
        raise FileNotFoundError(f"Naga side plate not found: {DEVICE_GLOB}")
    return matches[0]


def build_mapping(config):
    mapping = {}
    bindings = {item.get("button"): item for item in config.get("bindings", [])}
    for button, source_code in enumerate(SOURCE_CODES, start=1):
        binding = bindings.get(button, {"action": "default"})
        action = binding.get("action", "default")
        if action == "disabled":
            mapping[source_code] = None
        elif action == "key":
            mapping[source_code] = resolve_key(binding.get("value", ""))
        elif action == "default":
            mapping[source_code] = source_code
        else:
            raise ValueError(
                f"button {button}: action '{action}' is not yet supported on SteamOS"
            )
    return mapping


def main():
    try:
        config = json.load(sys.stdin)
        mapping = build_mapping(config)
        source = InputDevice(find_device())
        targets = sorted({code for code in mapping.values() if code is not None})
        output = UInput(
            {ecodes.EV_KEY: targets},
            name="Naga Trinity SteamOS Virtual Side Plate",
            version=1,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR:{error}", flush=True)
        return 2

    stopping = False

    def stop(_signal_number, _frame):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    try:
        source.grab()
        print("READY", flush=True)
        while not stopping:
            readable, _, _ = select.select([source.fd], [], [], 0.25)
            if not readable:
                continue
            for event in source.read():
                if event.type != ecodes.EV_KEY or event.code not in mapping:
                    continue
                target = mapping[event.code]
                if target is not None:
                    output.write(ecodes.EV_KEY, target, event.value)
                    output.syn()
    except OSError as error:
        print(f"ERROR:{error}", flush=True)
        return 3
    finally:
        try:
            source.ungrab()
        except OSError:
            pass
        output.close()
        source.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
