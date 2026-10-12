# GroveIn

Read sensor value(s) from a Grove sensor connected to your device.

The GroveIn widget reads a [Grove](https://wiki.seeedstudio.com/Grove_System/) sensor plugged into a WiFi-connected board, scales the reading(s), and sends them out its outlet(s). Use it for acceleration/tilt, distance, temperature & humidity, light, or the time of day, without writing any firmware yourself.

GroveIn only works over **Network** (WiFi). It needs a board running NTK's CircuitPython Firmata firmware, which is included with your NTK download (the `CircuitPython/` folder, with its own setup README). It does not work over a Serial (USB) connection; the "more" panel shows "Doesn't support serial" if Serial is selected.

## How it works

- **Pick a sensor** from the dropdown in the widget body. The chip name (e.g. "LIS3DHTR") is shown underneath, and one outlet appears on the right for each reading that sensor provides.
- **Tick the checkbox** on the left edge to start reading. The status dot and text below the dropdown show what's happening:
  - **idle** - not switched on.
  - **waiting** - switched on and asking the board, no reading back yet. The widget keeps asking every few seconds, so it recovers by itself if the board was still connecting.
  - **ok** - readings are arriving.
- **Readings are scaled** from the sensor's own range (**input range**, in the "more" panel) to the range you want downstream (**output range**), the same way AnalogIn works. **inv** (invert), **smo** (smoothing) and **eas** (easing) are in the widget body.
- **A line under the status** shows which outlet is which, top to bottom (e.g. "X, Y, Z" or "Temp, Humidity"). Once readings arrive it also shows each one's live value ("Distance 1234"), the same number that outlet is sending.

## Supported sensors

Two things differ from sensor to sensor and are worth checking in this table before you wire anything up:

- **How it connects.** I2C sensors just plug into the board's I2C Grove socket and are found automatically. Single-wire sensors plug into a digital Grove socket, and you must tell the widget which **pin**.
- **What the outlet sends.** Some sensors send NTK's usual 0-1023 scaling of their range. Others send the real-world number directly (°C, mm, the hour). You can change either in the "more" panel.

| Dropdown label | Chip / module | Connects by | Outlets | Outlet sends (default) | Updates |
|---|---|---|---|---|---|
| **Accelerometer** | LIS3DHTR | I2C | X, Y, Z | 0-1023, scaled from ±10 m/s² (about ±1g) | up to 50 times a second |
| **Distance** | VL53L0X (time of flight) | I2C | Distance | 0-1023, scaled from 0-1200 mm | up to 20 times a second |
| **Temp & Humidity** | DHT11 | Single wire - set **pin** (default `D7`) | Temp, Humidity | Real values: °C and % | every 2 seconds |
| **Light** | TSL2561 | I2C | Light | Real value, 0-10000 (lux in the default mode) | twice a second |
| **Distance (Ultrasonic)** | Grove Ultrasonic Ranger | Single wire - set **pin** (default `D7`) | Distance | Real value: mm, 0-3500 | about 3 times a second |
| **Clock** | PCF8563, on the Seeed XIAO expansion board | I2C (built into the expansion board) | Hour, Minute, Second | Real values: 0-23, 0-59, 0-59 | 4 times a second |

Notes on each sensor:

- **Accelerometer.** The default input range of about ±1g is what tilting the board through every orientation produces, so a full tilt swings the outlet across nearly the whole 0-1023 range. Widen the input range to capture harder shakes and impacts.
- **Distance (VL53L0X).** Reliable from a few centimetres out to roughly 1.2 m. Under about 5 cm it is inherently noisy. With nothing in range it reads maximum distance, not 0.
- **Temp & Humidity.** Avoid pins the board uses for analog input: `D0`-`D5` on the XIAO ESP32-S3, `D0`-`D2` on the XIAO ESP32-C6. `D7` works on both. The two-second update rate is a limit of the sensor itself.
- **Light.** A **mode** dropdown in the "more" panel chooses **Visible (lux)**, calibrated to how bright it looks to the eye, or **Full Spectrum** / **Infrared**, which are raw sensor counts, not lux. It reads `0` in very bright light as well as in darkness. Readings are capped at 10000.
- **Distance (Ultrasonic).** Rated for roughly 2 cm to 350 cm. Same pin advice as Temp & Humidity. With nothing in range it reads maximum distance, not 0.
- **Clock.** This is the battery-backed clock chip on the Seeed XIAO expansion board (the one with the OLED and the coin cell on the back), not a separate Grove module. It keeps time with the board unpowered. See "Using the clock" below.

Only sensors actually attached to the board respond. I2C sensors are detected when the board starts (its serial console prints a "Grove sensors found: ..." line). Picking one that isn't attached leaves the status at "waiting"; it does not show an error.

## Using the clock

**Set it once.** GroveIn only reads the clock. To set it, run the [`test_rtc.py`](https://github.com/netlabtoolkit/ntk/blob/master/firmware/test/test_rtc.py) script on the board (paste it into the REPL, or open it in Thonny and press Run). The script is in the `CircuitPython/` folder of the download (NTK 2026.10.4 and later), and in NTK's source on GitHub under `firmware/test/`. It fetches the time from an internet time server over WiFi and writes it to the chip, so the board needs a network with internet access for that one step - not SoftAP mode. After that the coin cell keeps it running.

- The **time zone** is a constant at the top of that file (`UTC_OFFSET_HOURS`). The chip has no notion of time zones or daylight saving: it counts on from whatever local time it was given, so run the script again when the clocks change.
- Until it has been set, or after the battery has been out, the outlets read **0, 0, 0**.

**Show it as a time.** Wire Hour, Minute and Second into a **Display** widget's three inlets. In the Display's "more" panel:

1. Set **decimals** to `0` on all three lines.
2. Set line 1's **format** to `<1:2>:<2:2>:<3:2>`.
3. Tick **blank** on lines 2 and 3.

Line 1 then shows `14:05:09`.

**Act on it.** The outlets are ordinary numbers, so IfThen can trigger something at a given hour or minute.

## Settings ("more" panel)

- **Device** - must be **Network**. Set the board's address and port (or use the left panel's default Device, which is applied to new hardware widgets automatically).
- **pin** - only shown for the single-wire sensors (Temp & Humidity, Ultrasonic). The board pin the sensor is wired to; defaults to `D7`.
- **mode** - only shown for the Light sensor. Which of its readings to use.
- **input range** (min/max) - the expected range of the sensor's own reading. Pre-filled per sensor.
- **output range** (min/max) - the range sent out the outlet. `0`-`1023` for Accelerometer and Distance; for the others it matches the input range, so the outlet carries the real-world value. Change it to rescale.
- **ease** / **smooth** - how much easing or smoothing is applied when those are switched on in the widget body.

A sensor with more than one reading (X/Y/Z, Temp and Humidity, Hour/Minute/Second) shares **one** input range and one output range across all of them.

## Standalone patches and Monitor mode

GroveIn works in a patch pushed to the board: the board reads the sensor itself, with the same scaling. In Monitor mode the widget shows the board's live values.

## Troubleshooting

- **Stuck on "waiting".** The selected sensor isn't attached, isn't wired correctly, or (for the single-wire sensors) the **pin** is wrong. Check the board's serial console for what it found when it started. A few seconds of "waiting" right after loading a patch or leaving Monitor mode is normal.
- **The clock reads 0, 0, 0.** It hasn't been set, or it lost power with no battery fitted. See "Using the clock".
- **The clock is an hour out.** Daylight saving changed. Update `UTC_OFFSET_HOURS` and run the set script again.
- **A reading is frozen at exactly 511.5.** That is NTK's "never received a value" placeholder, not a sensor fault. It usually means a cable was drawn from this widget's outlet before you switched sensors, and it still points at an outlet that no longer exists. Delete and redraw the cable.
- **Distance or light sits at its maximum.** The sensor is out of range (nothing in front of the distance sensor, or the light sensor saturated). That is how these sensors report it.
- **Values jump around.** Switch on **smo** in the widget body and raise **smooth** in the "more" panel.
- **Two widgets, one sensor.** Several GroveIn widgets can read the same sensor on the same board at once; each gets the same live readings.
