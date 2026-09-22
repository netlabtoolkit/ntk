# Standalone patch export

Normally your patch's logic runs on your computer, and NTK talks to the board over WiFi for every value. **Export Standalone** puts the patch's logic directly on the board instead, so it keeps running entirely on its own — no computer needed once it's deployed.

## Which widgets work

AnalogIn, AnalogOut, DigitalIn, DigitalOut, Servo, GroveIn, IfThen, Boolean, Gate, Mix, Splitter, Process, Count, Concat, Pulse, Sequence, Tween, Data.

Anything else — camera/ML widgets, speech widgets, LLM, Code, OSC/Cloud/Webhook, and desktop-only widgets like Text or Button — can't run standalone.

## Exporting and deploying

1. Build your patch using only the supported widgets above.
2. In the Settings drawer, click **Export Standalone**. If a widget you've used isn't supported, you'll get a list of exactly which ones — fix those first.
3. This downloads `standalone_patch.json`. Copy it onto the board's `CIRCUITPY` drive, in the same folder as `code.py`.
4. Reboot the board. It loads the patch and starts running it on its own.

## The board's three modes

A board running a standalone patch is always in one of three modes, shown by its status LED so you can tell at a glance without opening a serial console:

- **Standalone** — running its own patch, nobody connected. **One steady pulse per second.**
- **Monitored** — still running on its own, but a Monitor Device connection is watching (see below). **Two quick pulses per second.**
- **Controlled** — a normal NTK connection has taken over and is driving it directly, the same as a board with no standalone patch at all. **Solid on, no blinking.**

Whenever a normal (non-monitoring) connection reaches the board, it switches to Controlled: the standalone patch pauses and that connection takes over, resuming Standalone mode automatically once it disconnects. Importing a patch with active widgets, or connecting a widget's Device picker to the board, does this automatically — you don't have to do anything special to hand control back and forth.

## Watching it run: Monitor Device

You can watch a standalone patch's live values from NTK without switching the board into Controlled mode:

1. Load the same patch in NTK (the `.ntk` file you exported from, via **Import**).
2. Set the Settings drawer's Device picker to **Network**, with the board's IP address.
3. Click **Monitor Device**.

A banner appears at the top of the app, and widgets update live with what the board is doing — including dials, not just numbers. This is read-only: NTK's patch-editing actions (add/remove a widget, rewire a cable, edit a "more panel" field, load/clear the patch) are blocked with a warning while monitoring, since the board ignores anything NTK would otherwise try to send it. Click **Stop Monitoring** to disconnect — NTK resumes Controlled mode on its own if the patch's widgets are still active.

## Notes

- Make sure the patch loaded in NTK actually matches what's on the board — Monitor Device doesn't check this for you, it just won't show values for anything that doesn't match.
- Clearing or reloading the patch in NTK properly disconnects from the board, letting it fall back to Standalone mode (or idle, if it has no standalone patch of its own).
