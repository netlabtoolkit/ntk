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

## Push and Pull: deploy over WiFi, no USB needed

Once NTK can reach the board over the network, **Push** and **Pull** in the Settings drawer skip the manual copy-the-file-via-Thonny step entirely.

**Push** sends your current patch straight to the board and restarts it to run that patch immediately.

1. Build your patch using only the supported widgets above (same requirement as Export Standalone) — Push checks this the same way and shows the same list if something's unsupported.
2. Make sure NTK can reach the board: either a widget's Device picker is already set to Network with the board's address, or the Add Widgets panel's Device picker is — Push connects on its own if nothing's wired up on the canvas yet.
3. Click **Push to Device** and confirm the dialog.
4. The board saves the patch, restarts, and starts running it — NTK's connection drops for a moment while it reboots, then reconnects on its own.

**Pull** does the reverse: it fetches whatever patch is currently saved on the board and replaces your NTK canvas with it, so you can check exactly what's running without guessing. Same connection requirement as Push. Click **Pull from Device** — if the board has no standalone patch saved, you'll see a message saying so instead; if it does, you'll be asked to confirm before your current canvas is replaced.

**Erasing a board's standalone patch**: push with an empty canvas (delete everything first) to remove the standalone patch entirely, rather than replacing it with another one. You'll see a different confirmation specifically warning that this erases. After erasing, the board goes back to normal — no standalone patch, waiting for a client — on its next boot.

## The board's three modes

A board running a standalone patch is always in one of three modes, shown by its status LED so you can tell at a glance without opening a serial console:

- **Standalone** — running its own patch, nobody connected. **One steady pulse per second.**
- **Monitored** — still running on its own, but a Monitor Device connection is watching (see below). **Two quick pulses per second.**
- **Controlled** — a normal NTK connection has taken over and is driving it directly, the same as a board with no standalone patch at all. **Solid on, no blinking.**

Whenever a normal (non-monitoring) connection reaches the board, it switches to Controlled: the standalone patch pauses and that connection takes over, resuming Standalone mode automatically once it disconnects. Importing a patch with active widgets, or connecting a widget's Device picker to the board, does this automatically — you don't have to do anything special to hand control back and forth.

## Watching it run: Monitor Device

You can watch a standalone patch's live values from NTK without switching the board into Controlled mode:

1. Load the same patch in NTK — either **Import** the `.ntk` file you exported from, or click **Pull from Device** to fetch exactly what's on the board directly, which is also the surer way to know the two actually match.
2. Set the Settings drawer's Device picker to **Network**, with the board's IP address.
3. Click **Monitor Device**.

A banner appears at the top of the app, and widgets update live with what the board is doing — including dials, not just numbers. This is read-only: NTK's patch-editing actions (add/remove a widget, rewire a cable, edit a "more panel" field, load/clear the patch) are blocked with a warning while monitoring, since the board ignores anything NTK would otherwise try to send it. Click **Stop Monitoring** to disconnect — NTK resumes Controlled mode on its own if the patch's widgets are still active.

## Notes

- Make sure the patch loaded in NTK actually matches what's on the board — Monitor Device doesn't check this for you, it just won't show values for anything that doesn't match. **Pull** is the easy way to be sure: it replaces your canvas with exactly what the board has saved, rather than relying on you to keep the two in sync by hand.
- Clearing or reloading the patch in NTK properly disconnects from the board, letting it fall back to Standalone mode (or idle, if it has no standalone patch of its own).
