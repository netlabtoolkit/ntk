# GroveIn

The GroveIn widget reads a [Grove](https://wiki.seeedstudio.com/Grove_System/) sensor plugged into a WiFi-connected board, scales the reading(s), and sends them out its outlet(s) - use it for acceleration/tilt, distance, temperature & humidity, or light, without writing any firmware yourself.

GroveIn only works over **Network** (WiFi) - it needs the board running NTK's CircuitPython Firmata firmware, which is included with your NTK download (`firmware/xiao-esp32c6-circuitpython-firmata/`, with its own setup README). It does not work over a Serial (USB) connection - the "more" panel shows "Doesn't support serial" if Serial is selected.

## How it works

- Pick a sensor from the dropdown in the widget body. The chip name (e.g. "LIS3DHTR") is shown underneath, and one outlet appears on the right for each reading that sensor provides.
- Check the checkbox on the left edge to start reading. The status dot and text below the dropdown show what's happening:
  - **idle** - not yet checked on.
  - **waiting** - checked on, request sent, no reading back yet.
  - **ok** - readings are arriving normally.
- Readings are scaled from the sensor's raw range (**input range**, in the "more" panel) to whatever range downstream widgets expect (**output range**), same as AnalogIn - with **inv** (invert), **smo** (smoothing), and **eas** (easing) available per-reading in the widget body.
- A small line under the status shows which outlet nub is which (e.g. "X, Y, Z" or "Temp, Humidity", top to bottom). Once readings are arriving it also shows each one's **live scaled value** next to its label ("Distance 1234", "X 512   Y 480   Z 600") - the same number that widget's outlet is sending.

## Supported sensors

| Dropdown label | Chip | Readings | Notes |
|---|---|---|---|
| Accelerometer | LIS3DHTR | X, Y, Z (m/s²) | I2C - just plug in, no extra setup. Input range defaults to about ±1g, enough for tilt; widen it in the "more" panel to also capture harder shakes/impacts. |
| Distance | VL53L0X | Distance (mm) | I2C - just plug in. Reliable from a few cm out to roughly 1.2m; very close range (under ~5cm) is inherently noisy on this sensor. With nothing in range, reads as maximum distance rather than 0. |
| Temp & Humidity | DHT11 | Temp (°C), Humidity (%) | **Single-wire digital, not I2C** - defaults to pin `D7`; change it in the "more" panel's **pin** field if you wired it elsewhere. Avoid `D0`-`D2` (reserved by the board for analog input); use `D3`-`D10`. Updates at most every 1-2 seconds - that's a limit of the sensor itself, not the widget. |
| Light | TSL2561 | Light (no fixed unit) | I2C - just plug in. Has a **mode** dropdown in the "more" panel: **Visible (lux)** (calibrated to match how bright it looks to the eye), **Full Spectrum**, or **Infrared** (raw sensor-channel counts, not lux). Reads as `0` in very bright light as well as in darkness - Visible/lux mode is the one to use unless you specifically need the raw channels. |
| Distance (Ultrasonic) | Ultrasonic Ranger | Distance (mm) | **Single-wire digital, not I2C** - same **pin** field as Temp & Humidity above (defaults to `D7`; avoid `D0`-`D2`). Rated range is roughly 2cm-350cm; with nothing in range, reads as maximum distance rather than 0. Outlet reads real millimeters directly (same 1:1 passthrough as Temp & Humidity/Light above), not the usual 0-1023 scale. Updates roughly every 300ms - slower than most sensors here, since this specific module needs more settle time between pings than its own datasheet suggests. Hardware-verified. |

Only sensors actually wired to the board respond - I2C sensors are auto-detected at boot (see the board's serial console for a "Grove sensors found: ..." summary line), and picking one that isn't attached just leaves the status at "waiting" indefinitely rather than erroring.

## Settings ("more" panel)

- **Device** - must be **Network**; pick the board from the ip/port fields (or use the left panel's default Device, applied automatically to new hardware widgets).
- **pin** - only shown for the single-wire sensors (DHT11, Ultrasonic). The board pin it's wired to; **defaults to `D7`**.
- **mode** - only shown for sensors that offer it (currently the light sensor). Which of the sensor's own readings to use.
- **input range** (min/max) - the expected range of the raw sensor reading. Pre-filled with a sensible default per sensor; widen or narrow it to taste.
- **output range** (min/max) - the range sent out the outlet. Defaults to NTK's usual `0`-`1023` convention, except Temp & Humidity, which defaults to a 1:1 passthrough so the outlet reads real-world °C/% directly.
- **ease** / **smooth** - amount of easing/smoothing applied when those options are turned on in the widget body.

A sensor with more than one reading (Accelerometer's X/Y/Z, Temp & Humidity's two values) shares **one** input/output range across all of them - if the readings are on very different scales, narrowing the range for the one you care about will over- or under-scale the other.

## Troubleshooting

- **Stuck on "waiting"** - the selected sensor isn't actually wired to the board, isn't wired correctly, or (for the single-wire sensors) the **pin** field is wrong (it defaults to `D7`). Check the board's serial console for what it found at boot.
- **A reading looks frozen at exactly 511.5 and never updates** - this is NTK's generic "never received a value" placeholder, not a sensor problem. It usually means a cable was drawn to this widget's outlet *before* switching sensors or editing the sensor's readings, and is still pointing at an outlet that no longer exists under that name. Delete and redraw the cable.
- **Distance or light readings hit their max and stay there** - the sensor is out of range (nothing in front of the distance sensor, or the light sensor saturated in very bright light) rather than reporting an error; this is expected sensor behavior, not a bug.
- **Values jump around a lot** - turn on **smo** (smoothing) in the widget body, and raise **smooth** in the "more" panel.
- Multiple GroveIn widgets can point at the same board and the same sensor at once (e.g. two widgets both reading temperature) - they all receive the same live readings independently.
