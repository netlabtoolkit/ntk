# Standalone patch export & Monitor Device

Normally, a patch's logic runs on your computer — NTK talks to the board over WiFi (or serial) for every value, and closing NTK or disconnecting the board stops the patch. **Standalone patch export** lets you put a patch's logic directly on the board itself, so it keeps running on its own — no computer required once it's deployed.

**Monitor Device** is the companion feature: point NTK at a board that's running a standalone patch and watch its live values in the same widget UI you'd normally use to control it, without taking over.

## Which widgets can run standalone

The on-device interpreter supports:

**AnalogIn, AnalogOut, DigitalIn, DigitalOut, Servo, GroveIn, IfThen, Boolean, Gate, Mix, Splitter, Process, Count, Concat, Pulse, Sequence, Tween, Data**

Anything not on that list — camera/ML widgets (FaceTrack, PoseRecog, ObjectRecog), speech widgets (SpeechIn, SpeechOut), the LLM widget, Code, OSC/Cloud/Webhook widgets, desktop-only widgets (Text, Button, Image, Video, Audio, HTML, Keyboard, Knob) — can't be exported standalone. Gesture is deferred too (not yet supported).

## Exporting a patch

1. Build your patch using only supported widgets (see above), wired to real hardware pins the way you normally would.
2. Open the Settings drawer and click **Export Standalone**.
3. If every widget is supported, this downloads `standalone_patch.json`. If something isn't, you get an alert listing exactly which widgets to remove or replace — nothing downloads until the patch is fully compatible.

## Deploying it to the board

Copy `standalone_patch.json` onto the board's `CIRCUITPY` drive, in the same folder as `code.py` (the root of the drive) — e.g. by mounting the drive and dragging the file over, or using Thonny's file browser. There's no "push from NTK" button yet; this is a manual copy step for now (see "What's not built yet" below).

Once the file is there, reboot the board (or it'll pick it up on its next boot). Its serial console will print something like:

```
standalone patch topology:
  A0 -> AnalogIn -> IfThen -> AnalogOut -> D5
Standalone patch loaded and compatible: standalone_patch.json
Standalone interpreter running (no client connected)
```

From this point the board runs the patch entirely on its own — you can disconnect it from your computer, power it from a battery or wall adapter, whatever you'd normally do with a finished project.

**Explicit handoff:** if NTK (or anything else) connects to the board normally — the way you would to control it live — the interpreter pauses and hands control to that connection, exactly like a patch with no standalone file at all. It resumes automatically once that connection closes. The one exception is Monitor Device (below), which is designed specifically not to trigger this handoff.

## Watching it run: Monitor Device

1. In NTK, load the *same* patch you exported (open the `.ntk` version via **Import**, not the `standalone_patch.json` — they're different file formats, though they describe the same patch). Monitor Device shows values by matching widgets already on your canvas; it doesn't build the patch for you.
2. In the Settings drawer, set the **Device** picker to **Network** with the board's IP address (and port, if you changed it from the default 3030).
3. Click **Monitor Device** in the Settings drawer.

A banner appears across the top of the app: *"NTK is in remote monitoring mode — watching \<ip\>:\<port\> (read only)"*, and every matching widget's values update live as the board computes them — including the little dial on a widget like AnalogIn, not just its numeric readout. Click **Stop Monitoring** (in the banner or the toolbar, they stay in sync) to disconnect.

**This is read-only.** While monitoring:

- Dragging a widget's own dial/knob or clicking its main-body controls still works, but the board ignores anything NTK tries to send it — you're simulating locally, not actually changing what the board is doing.
- Adding or removing a widget, wiring or unwiring a cable, editing a "more panel" field, or loading/clearing the patch is blocked outright — you'll see a short warning message and the banner will flash. This is deliberate: those changes would desync what's on your canvas from what the board is actually running.
- Moving a widget around the canvas is fine — that's just layout, it doesn't affect anything.

## What's not built yet

- **No "push patch to device" from NTK.** Getting a patch onto the board is still a manual file copy. A "Deploy" button that sends the current patch over WiFi is designed but not implemented.
- **No "pull patch from device" either.** NTK has no way to check whether the patch you have loaded actually matches what the board is running. If they've drifted apart, Monitor Device won't error — it'll just quietly show no values for anything the board doesn't recognize, and never update anything you've added locally that the board doesn't have. Make sure you're looking at the same `.ntk` file you exported from.
- **OSC/Cloud/LLM widgets** aren't supported standalone yet — the board would need its own WiFi request handling, which hasn't been scoped.

## Troubleshooting

- **Board won't load the standalone patch** — check the serial console for the reason (usually an incompatible widget slipped through, or the file isn't named exactly `standalone_patch.json` in the drive's root).
- **"Set the Device picker to a Network device (server address) first"** — Monitor Device needs the Settings drawer's Device picker set to Network with an address filled in; it doesn't work over Serial.
- **Monitor Device connects but nothing updates** — the board is probably running a different patch than the one loaded in NTK (see "No pull patch from device" above). Re-import the exact `.ntk` file you exported from.
- **A widget's value updates but its dial/knob doesn't move** — this was a real bug (fixed) for source widgets like AnalogIn, whose dial reflects the raw incoming value rather than the computed one. If you see it again on a different widget, it's the same class of issue.
