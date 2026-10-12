# NeoPixel

Drive a strip or ring of addressable RGB LEDs with a choice of patterns.

The NeoPixel widget controls a NeoPixel (WS2812-type) LED strip or ring attached to a WiFi-connected board. Pick a pattern, a color, a speed and a brightness, and optionally wire other widgets in to change them live: a knob for brightness, a sensor for speed, a microphone level for a VU meter. The widget body shows a simulated strip, so you can design the whole effect before any LEDs are connected.

NeoPixel needs a board running NTK's CircuitPython Firmata firmware, which is included with your NTK download (the `CircuitPython/` folder, with its own setup README), connected over **Network** (WiFi). A board running standard Arduino Firmata does not understand the NeoPixel widget.

## How it works

- **Set the pin** in the field on the right edge of the widget. This is the board pin the strip's data line is wired to; it defaults to `D7`.
- **Set how many pixels** the strip has, in the "more" panel. The default is `8`.
- **Choose a mode**, color, speed and brightness in the "more" panel.
- **The widget body is a live preview** of the pattern, running whether or not a board is connected.
- **Tick the checkbox** on the right edge to send it to the board. After that, every change you make is sent as you make it.

The pattern runs on the board itself. NTK only sends the settings when one of them changes, so chase, sparkle and rainbow stay smooth regardless of the WiFi connection.

## Modes

| Mode | What the strip does | Uses color | Uses speed |
|---|---|---|---|
| **Full** | Every pixel lit in the chosen color. | Yes | No |
| **Chase** | One bright pixel travels along the strip with a short fading tail behind it, like a comet. | Yes | Yes |
| **Sparkle** | A random scattering of pixels (about a third of them) lit at any moment, changing as it goes. | Yes | Yes |
| **Rainbow** | The whole color wheel spread along the strip and rotating. | No | Yes |
| **VU meter** | A bar: the strip fills from the first pixel in proportion to the **in** inlet's level. | Yes | No |

## Inlets

Top to bottom:

- **in** — its meaning depends on the mode. In **VU meter** mode it is the meter level: `0` lights nothing, `1023` lights the whole strip. In every other mode it sets **brightness**, with `0`-`1023` covering off to full.
- **speed** — the pattern's speed, `0`-`100`. This is the same scale as the speed field, not NTK's usual 0-1023, so set the source widget's output range to `0`-`100`. Values above 100 are treated as 100.
- **color** — the color as a position on the color wheel, `0`-`1023`: red at `0`, through green and blue, and back to red at the top.

A wired inlet takes over from the matching field in the "more" panel. The field and the color picker update to show what the wire is doing, so you can always see the value in use.

## Settings ("more" panel)

- **Device** — set this to **Network**, with the board's address and port (or use the left panel's default Device, which is applied to new hardware widgets automatically). Changing the device, address, port or pin unticks the checkbox; tick it again to reconnect.
- **pixels** — the number of LEDs on the strip. The on-screen preview draws up to 300.
- **format** — **RGB** for ordinary three-color pixels, **RGBW** for pixels that also have a white LED. Choosing the wrong one makes the colors come out wrong or shifted along the strip. With RGBW pixels the widget drives the red, green and blue LEDs only; the white LED stays off.
- **mode** — one of the five patterns above.
- **speed** — `0` to `100`. `0` stops the pattern where it is. `1` is the slowest, about 6 seconds for one full trip along the strip; `100` is the fastest, about a third of a second. The steps in between are spaced so the change feels even across the whole range.
- **color** — a color picker. Because a darker pick is the same thing as a lower brightness, picking a dark color lowers **brightness**, and changing **brightness** darkens the swatch.
- **brightness** — `0` to `100`.
- **preview** — **Strip** or **Ring**. This only changes how the simulated pixels are laid out in the widget, to match what you have on your desk. It has no effect on the LEDs.

## The preview

The preview runs the same pattern as the board, but it is drawn separately, so the two are not locked together: the chase's bright pixel will be at a different position on screen than on the strip, and sparkle's random pixels will differ. The speed, color and overall look match.

The preview's brightness is adjusted to look the way real LEDs do. An LED at 20% brightness still looks strongly lit, where a screen color at 20% would look nearly black, so the preview shows low brightness settings brighter than a plain percentage would.

## Standalone patches

NeoPixel works in a patch pushed to the board. The board runs the pattern itself, including anything wired into the inlets from the board's own sensors.

## Wiring and power

- The strip's **data in** goes to the pin set in the widget. Strips have a direction: connect to the end marked with the arrow pointing away from the board (often labelled DIN).
- Connect the strip's ground to the board's ground, even when the strip has its own power supply.
- LEDs draw a lot of current. A short strip or ring at modest brightness can run from the board; a longer strip, or one run at high brightness, needs its own 5V supply. Lowering **brightness** is the easiest way to reduce the load.

## Troubleshooting

- **The strip doesn't light.** Check that the checkbox is ticked, that **pin** matches the pin the data line is on, and that the strip is connected at its input end.
- **Only part of the strip lights.** **pixels** is set lower than the number of LEDs.
- **Colors are wrong, or a pattern looks scrambled.** **format** doesn't match the strip. Switch between RGB and RGBW.
- **The pattern is frozen.** **speed** is `0`, or something wired into the speed inlet is sending 0.
- **The brightness field keeps changing.** Something is wired into the **in** inlet. Outside VU meter mode that inlet sets brightness.
- **The speed inlet only ever gives full speed.** The source is sending 0-1023. Set its output range to `0`-`100`.

## Example patches

- **Knob → NeoPixel (in)** — a brightness dial.
- **AnalogIn → NeoPixel (in), mode VU meter** — a sensor or sound level shown as a bar.
- **AnalogIn (output range 0-100) → NeoPixel (speed), mode Chase** — a sensor that speeds the chase up and slows it down.
- **Knob → NeoPixel (color), mode Full** — sweep the whole strip through the color wheel.
- **GroveIn (Distance) → NeoPixel (in), mode VU meter** — a proximity bar that fills as something approaches or retreats.
