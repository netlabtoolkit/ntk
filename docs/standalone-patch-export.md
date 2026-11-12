# Standalone Patches

Normally your patch runs on your computer, and NTK talks to the board over WiFi for every value. A **standalone patch** runs on the board itself: push it once, and the board keeps running it on its own - no computer needed, powered from a battery or a wall adapter like any finished project.

## Contents

- [Which widgets work](#Which-widgets-work)
- [Push and Pull](#Push-and-Pull)
- [Exporting by hand](#Exporting-by-hand)
- [Three modes on the board](#Three-modes-on-the-board)
- [Watching it run with Monitor](#Watching-it-run-with-Monitor)
- [Keeping the firmware up to date](#Keeping-the-firmware-up-to-date)
- [Troubleshooting](#Troubleshooting)

## Which widgets work

**Inputs and outputs**: AnalogIn, AnalogOut, DigitalIn, DigitalOut, Servo, GroveIn, Encoder, NeoPixel, Display.

**Logic and timing**: IfThen, Cases, Boolean, Gate, Mix, Splitter, Process, Count, Concat, Data, Pulse, Tween, Sequence, Scene.

**Network**: OSCIn, OSCOut, CloudIn, CloudOut, DCC Throttle, DCC Function.

The trigger and next ports work on the board too, for Scene, Sequence, Tween, Pulse, Count and DigitalIn - so a chain of steps runs standalone just as it does in NTK. See [Chaining Widgets - Trigger and Next](https://www.netlabtoolkit.org/chaining-widgets/).

Anything else needs NTK running: the camera and recognition widgets (FaceTrack, PoseRecog, ObjectRecog, Gesture), SpeechIn and SpeechOut, LLM and Decide, Audio, Video, Image, Text, HTML, Code, Webhook, Keyboard, and the on-screen Button and Knob. Push tells you which widget is the problem before it sends anything.

**OSCOut needs a real address.** Its usual target, 127.0.0.1, means "the computer running NTK" - on a board running by itself, that's the board. Set OSCOut's IP (in its more panel) to whatever is receiving the messages: another computer, a Raspberry Pi, anything on the board's WiFi network. OSCIn works as it is - it listens on the board's own address.

## Push and Pull

**Push** and **Pull** are in the **Device** group of the toolbar on the left. They send a patch to the board, or fetch one from it, over WiFi - no USB cable or file copying.

NTK finds the board from the **Device**, **ip** and **port** fields at the top of the Add Widgets panel: set Device to **Network** and ip to the board's address (`ntk-device.local` by default, or its IP number).

**Push** sends the patch on the canvas to the board:

1. Build the patch with the widgets above.
2. Click **Push** and confirm. If a widget can't run on the board, Push says which one and sends nothing.
3. The board saves the patch, restarts and starts running it. NTK loses the connection for a moment while the board restarts, then reconnects.

**Pull** does the reverse: it fetches the patch saved on the board and replaces the canvas with it, after asking you to confirm - the sure way to see exactly what the board is running. If the board has no standalone patch, Pull says so.

**To erase** the board's standalone patch, push an empty canvas: delete every widget, then Push. The confirmation warns that this erases. The board then goes back to normal - no patch of its own, waiting for NTK.

## Exporting by hand

Without WiFi to the board, you can copy the patch over USB instead:

1. Click **Export** in the toolbar. It downloads the patch as `standalone_patch.json`. Export doesn't check the widgets - Push does.
2. Copy `standalone_patch.json` onto the board's `CIRCUITPY` drive, next to `code.py`, by dragging it in the Finder or with Thonny's file browser.
3. Reset the board. It loads the patch and starts running it.

The board's serial console (in Thonny) shows what it loaded:

```
standalone patch topology:
  A0 -> AnalogIn -> IfThen -> AnalogOut -> D5
Standalone patch loaded and compatible: standalone_patch.json
Standalone interpreter running (no client connected)
```

## Three modes on the board

A board with a standalone patch is always in one of three modes, which its status LED shows:

- **Standalone** - running its own patch, nothing connected. **One short pulse a second.**
- **Monitored** - still running its own patch, with NTK watching through Monitor (see below). **Two quick pulses a second.**
- **Controlled** - NTK has connected normally and is driving the board directly, as it would a board with no standalone patch. **Solid on.**

When NTK connects normally - a widget set to the board and turned on, or a patch with active widgets loaded - the standalone patch pauses and NTK takes over. When NTK disconnects, the board goes back to running its own patch. Monitor is the one connection that doesn't take over.

## Watching it run with Monitor

**Monitor** shows the board's live values in NTK's widgets, without taking control:

1. Load the same patch the board is running. **Pull** is the surest way - the canvas then matches the board exactly. **Import** of the patch file you pushed works too.
2. Set the Add Widgets panel's Device to **Network**, with the board's address.
3. Click **Monitor**.

A banner across the top says NTK is in remote monitoring mode, and the widgets show what the board is doing - values, dials, a Scene's current cue. Click **Stop Monitoring** to disconnect.

Monitor is read-only:

- Adding or removing a widget, changing a cable, editing a more-panel setting, or loading or clearing the patch is blocked, with a warning - those would make the canvas differ from what the board runs.
- Turning a widget's own dial or clicking its controls changes only what NTK shows; the board ignores it.
- Moving widgets around the canvas is fine.

The board reports its values a few times a second, so a fifth-of-a-second next pulse isn't always shown - the board still sends it.

## Keeping the firmware up to date

The board runs a patch with its own copy of NTK's widget code, in the firmware files on its `CIRCUITPY` drive. When a new NTK release changes it - a new widget that runs standalone, a fix - the release notes list the files to copy from the `CircuitPython` folder in the NTK download. Copy them to the board with Thonny, check each copied file's size matches the original before resetting (a copy cut short makes the board crash when it loads a patch), then Push your patch again.

The board prints its firmware version when it starts - `Firmware build: 2026.15.0` - so you can check it matches your NTK.

## Troubleshooting

- **Push says a widget is unsupported** - that widget needs NTK running (see [Which widgets work](#Which-widgets-work)). Remove it, or keep the patch on the computer.
- **The board doesn't run the patch** - look at its serial console in Thonny. It prints `Standalone patch present but rejected:` and the reason - usually a widget it doesn't know, which means its firmware is older than your NTK (see [Keeping the firmware up to date](#Keeping-the-firmware-up-to-date)). A patch copied by hand must be named exactly `standalone_patch.json`, next to `code.py`.
- **Push, Pull or Monitor can't reach the board** - check the Add Widgets panel's Device is **Network** with the board's address, and that the computer and the board are on the same WiFi network.
- **Monitor connects but nothing updates** - the canvas doesn't match the patch on the board. Pull it, then Monitor again.
