# OSCIn

The OSCIn widget receives [OSC](https://en.wikipedia.org/wiki/Open_Sound_Control) messages from another application or device over the network, scales the incoming number, and sends it out its outlet - use it to drive a patch from software like Max/MSP, Pure Data, TouchOSC, SuperCollider, Processing, openFrameworks, Unity, or another copy of NTK.

## How it works

- OSCIn listens on a UDP **port** and matches incoming messages by their OSC address (the **message** field, e.g. `/ntk/in/1`).
- When a message arrives at that address, OSCIn takes its **first argument** as the value. That raw value is shown in the widget's upper display.
- The raw value is scaled from the **in** range to the **out** range (both default to `0`-`1023`, a 1:1 passthrough) and sent out the outlet. The scaled value is shown in the lower display.
- The checkbox on the left edge turns listening on and off (on by default).
- The dial in the widget body lets you **simulate an incoming message** - drag it to send a test value (0-1023) out the outlet without anything actually sending OSC. Use it to build and verify the rest of your patch before the sender is set up.

## Settings

**In the widget body:**

- **in** (two fields) - the low and high end of the values you expect to receive.
- **out** (two fields) - the low and high end of the range to send out the outlet. Set these to whatever the widgets downstream expect (NTK's normal convention is `0`-`1023`).

**In the "more" panel:**

- **port** - the UDP port to listen on (default `57190`). The sending application must send to this same port.
- **message** - the OSC address to match (default `/ntk/in/1`). Only messages sent to exactly this address are received; anything else on the port is ignored. Any valid OSC address works here, not just the `/ntk/in/N` defaults.

## Connecting another application

1. Find the IP address of the computer running NTK. If the sender is on the *same* machine, use `127.0.0.1` (localhost). If it's another device on your network, use NTK's LAN IP address (shown in the Add Widgets panel).
2. In the sending application, set its OSC output to that IP address and to OSCIn's **port** (`57190` by default).
3. Send messages to the address in OSCIn's **message** field, with a single numeric argument.
4. Check the OSCIn checkbox. When messages arrive, the upper display updates.

Several OSCIn widgets can share one port - each one picks off only the address in its own **message** field. OSCIn and OSCOut also share a single network socket internally, so you don't need to worry about port conflicts between them.

## Troubleshooting

- **Nothing arrives** - confirm the sender's target IP and port exactly match this computer's address and OSCIn's **port**; confirm the OSC address exactly matches the **message** field (a leading slash is required, and it's case-sensitive); confirm the OSCIn checkbox is checked.
- **Still nothing across two machines** - your operating system's firewall may be blocking incoming UDP on that port. Allow it, or test first with both ends on `127.0.0.1`.
- **The value jumps to a huge number** - the sender's range is wider than the **in** range you set, so scaling extrapolates past the **out** ceiling. Widen the **in** fields to match what's actually being sent.
- **Only the first value in a message is used** - OSCIn reads argument 1 and ignores the rest. To receive several values, send them to separate addresses and use one OSCIn per address.
- **Non-numeric messages** (strings, etc.) can't be scaled and won't produce a useful outlet value.

## What changed

Earlier versions only accepted the fourteen predefined `/ntk/in/1` ... `/ntk/in/14` addresses. OSCIn now receives any OSC address you put in the **message** field.
