# OSCOut

The OSCOut widget sends an [OSC](https://en.wikipedia.org/wiki/Open_Sound_Control) message over the network whenever its input changes - use it to control another application or device from a patch, such as Max/MSP, Pure Data, SuperCollider, Processing, openFrameworks, Unity, a lighting console, or another copy of NTK.

## How it works

- Wire a widget into OSCOut's inlet (left edge). Each time that value changes, OSCOut sends an OSC message to the target **ip** and **port**, at the address in the **message** field, with the value as its single argument.
- The upper display shows the incoming value; the lower display shows the value as sent (rounded to a whole number in **int** mode).
- The checkbox on the right edge turns sending on and off. **It is off by default** - nothing is sent until you check it.
- The dial in the widget body lets you **send test messages by hand** - drag it to send a value (0-1023) without wiring anything into the inlet. Use it to confirm the receiving application is set up correctly before building the rest of the patch.
- OSCOut only sends when the value actually changes. Sending the same value twice in a row produces just one message.

## Settings ("more" panel)

- **message** - the OSC address to send to (default `/ntk/out/1`).
- **ip** - the address of the machine to send to (default `127.0.0.1`, localhost - the same computer NTK is running on). For another device on your network, use its LAN IP address.
- **port** - the UDP port on that machine to send to (default `57120`, a common default for OSC-receiving software such as SuperCollider). Set this to whatever port the receiving application listens on.
- **float / int** - whether to send the value as a decimal (OSC float) or a whole number (OSC integer). Choose whichever the receiving application expects.

## Connecting to another application

1. In the receiving application, set it to listen for OSC on some UDP port.
2. Put that port in OSCOut's **port** field, and the receiving machine's address in **ip** (`127.0.0.1` if it's the same computer).
3. Set **message** to the address the receiver expects, and pick **float** or **int**.
4. Check the OSCOut checkbox, then move the dial (or the wired input). The receiver should see messages arrive.

The value sent is whatever reaches the inlet, unchanged apart from optional rounding - OSCOut has no range fields of its own. NTK's internal convention is `0`-`1023`; if the receiving application wants a different range (e.g. `0.0`-`1.0`), rescale upstream using the range fields on the widget feeding OSCOut.

## Sending to another NTK patch

Point OSCOut at an OSCIn widget: set **port** to `57190` (OSCIn's default) and **message** to match OSCIn's **message** field. Use `127.0.0.1` to talk between widgets in the same patch, or the other computer's LAN IP to send between two machines running NTK.

## Troubleshooting

- **Nothing is received** - confirm the OSCOut checkbox is checked; confirm **ip** and **port** match the receiver exactly; confirm **message** is the address the receiver expects (leading slash required, case-sensitive).
- **Across two machines** - the receiving computer's firewall may block incoming UDP on that port. Allow it, or test on `127.0.0.1` first.
- **Only changes are sent** - if the receiver needs a value resent on every frame, or needs an initial value on startup, OSCOut won't do that on its own; nudge the input so the value changes.
- **Wrong number type** - if the receiver rejects or misreads the value, try switching between **float** and **int**.
- **Value out of range for the receiver** - rescale with the range fields on the widget wired into OSCOut; OSCOut passes its input through as-is.
