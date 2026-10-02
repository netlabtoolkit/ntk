"""
CircuitPython's default filesystem mount is writable from your computer
(Finder/Thonny drag-and-drop) and READ-ONLY from code running on the
board itself - the safe default, so a running program can't corrupt a
file you're mid-edit on from your computer. Push (see
plans/standalone-patch-export.md's "Push/Pull standalone patch"
section) writes standalone_patch.json FROM CODE running on the board
(ntk_firmata_main.py's _handle_push_patch_request), which needs the
opposite - without a remount, that write fails with
`[Errno 30] Read-only filesystem`.

Defaults to NOT remounting (stays host-writable, Finder/Thonny drag-
and-drop keeps working normally) - an earlier version of this file
defaulted the other way (remount unconditionally, later made an opt-
out toggle still defaulting to remount), but that traded away Finder
access for good every time this board is plugged in, a real ongoing
cost during active development, not just a one-time inconvenience
(raised 2026-09-25 right after confirming Push worked that way).

That's fine because Push no longer NEEDS the device-side write to
succeed on its own: NetworkModel.js's pushPatch()/pullPatch()
(StandardFirmataModel.js) try the normal network path FIRST, and only
if THAT fails do they fall back to writing standalone_patch.json
directly through the host filesystem - which needs exactly the write
access CircuitPython already grants the host by default. So on a
Mac with this board's CIRCUITPY volume mounted (the normal USB-
tethered dev/testing setup), Push works either way regardless of this
file's default, with no Finder-access tradeoff. This file's toggle
below only matters for a genuinely standalone deployment - a board
running headless (no computer attached at all, e.g. on battery/wall
power) that still needs to accept a Push over WiFi sometime after
being deployed, where there's no local mount for that fallback to use
at all. Opt into that with:

    NTK_REMOUNT_FOR_CODE_WRITES = true

in settings.toml, then a hard reset (not Ctrl-D - boot.py only runs on
power-up/hard reset, never on a soft reload) - remove the line and
hard-reset again to restore normal Finder/Thonny drag-and-drop access.

This does NOT break the project's normal deploy workflow either way:
Thonny writes files via the CircuitPython REPL/serial protocol, not
the USB mass-storage protocol this remount affects, so `.mpy` deploys
via Thonny (see the .mpy-deploy-via-Thonny memory/convention) work
identically regardless of this setting.
"""

import os
import storage

if os.getenv("NTK_REMOUNT_FOR_CODE_WRITES") or False:
    storage.remount("/", readonly=False)
