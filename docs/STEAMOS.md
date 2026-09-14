# SteamOS bring-up

Target confirmed on a Steam Deck:

- SteamOS 3.8.16 (Arch-based)
- Linux 6.16.12 Valve/Neptune kernel
- KDE Plasma 6.4.3
- Wayland session
- Razer Naga Trinity VID `1532`, PID `0067`

The mouse exposes three HID interfaces:

| Interface | Linux input role |
| --- | --- |
| `input0` | Pointer, buttons, wheel and wheel tilt |
| `input1` | Currently idle keyboard-style interface |
| `input2` | Twelve-button side plate as `1-9`, `0`, `-`, `=` |

The normal pointer interface reports `BTN_MIDDLE` correctly. Wheel tilt reports
`BTN_SIDE` and `BTN_EXTRA`. The twelve-button plate is available independently
through its own evdev node, making device-specific interception possible.

## First USB probe

Install dependencies and run the read-only probe:

```bash
git clone https://github.com/KNLMN/Razer-Naga-Trinity-STEAMOS.git
cd Razer-Naga-Trinity-STEAMOS
git switch codex/steamos-foundation
npm install
npm run probe:steamos
```

The probe only enumerates and opens the USB device. It does not send reports or
change the mouse.

Expected final line:

```text
PASS: libusb can open the Naga as the current user
```

## Porting sequence

1. Verify the existing `usb` dependency on SteamOS.
2. Run the Electron UI and test the existing profile write path.
3. Separate platform-specific startup and power-management behavior.
4. Replace the macOS `osascript` macro backend with Linux evdev/uinput.
5. Package an AppImage, then evaluate Flatpak permissions.
