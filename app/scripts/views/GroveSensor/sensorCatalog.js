define([], function() {
    'use strict';

    /**
     * Client-side catalog for the GroveSensor widget - hand-kept in sync
     * with firmware/xiao-esp32c6-circuitpython-firmata/pins.py's
     * GROVE_SENSOR_CATALOG (same sensor ids, same reading order). Not
     * transmitted over the wire - see firmata_server.py's module
     * docstring for why a wire-transmitted catalog was skipped for v1.
     *
     * readings is in the exact order the firmware sends values, since
     * the source field wired up for each is "grove-<id>-<readingIndex>",
     * a plain numeric index - see StandardFirmataModel.js's
     * GROVE_SENSOR_REPLY handler.
     */
    return {
        0: {
            label: 'Accelerometer',
            // Shown below the sensor dropdown (see template.js) so the
            // exact chip is always visible regardless of how generic the
            // dropdown label is - useful once there's more than one
            // sensor of the same general kind (e.g. a future Time-of-
            // Flight entry would show "VL53L0X" here).
            deviceId: 'LIS3DHTR',
            tested: true,
            readings: [
                {key: 'x', label: 'X', unit: 'm/s²'},
                {key: 'y', label: 'Y', unit: 'm/s²'},
                {key: 'z', label: 'Z', unit: 'm/s²'},
            ],
            // Used to seed inputFloor/inputCeiling (see GroveSensor.js's
            // remapSensor()) so the widget's existing scale-to-0-1023
            // mechanism (the same one AnalogIn uses) has a sensible
            // starting point instead of passing raw, sometimes-negative
            // m/s^2 values straight through to whatever's wired downstream.
            //
            // The LIS3DH's configured full-scale range is +/-2g (~19.6
            // m/s^2), but that's the sensor's electrical ceiling, not what
            // normal handling produces: with no shaking, gravity alone
            // (1g, ~9.8 m/s^2) is the only thing moving a given axis as the
            // board is tilted, so a +/-2g default range only ever gets
            // used through its middle half - the scaled output can't reach
            // near 0 or 1023 without literally shaking the board hard
            // enough to add a second g of linear acceleration on top of
            // gravity. +/-10 (roughly 1g, rounded up slightly for headroom)
            // matches what simply tilting the board through all
            // orientations actually produces, so a full tilt swings the
            // scaled output across close to the full 0-1023 range. A user
            // who genuinely wants to capture shake/impact forces beyond 1g
            // can still widen inputFloor/inputCeiling in the "more" panel.
            range: {floor: -10, ceiling: 10},
        },
        // Hardware-verified. Firmware side: pins.py's
        // GROVE_SENSOR_CATALOG entry 1 - note that pins.py applies a
        // fixed -50mm calibration offset to this specific module's raw
        // readings before they ever reach here (see its
        // _VL53L0X_OFFSET_MM comment), so values arriving at this widget
        // should already read close to true distance in the sensor's
        // normal operating range (readings well under ~50mm are
        // inherently unreliable on this sensor - a near-field optical
        // crosstalk limitation, not something either side can calibrate
        // away).
        1: {
            label: 'Distance',
            deviceId: 'VL53L0X',
            tested: true,
            readings: [
                {key: 'distance', label: 'Distance', unit: 'mm'},
            ],
            // The VL53L0X's rated range is up to ~1200mm under good
            // conditions (shorter in bright ambient IR light) - not yet
            // confirmed against real hardware at the extremes, only in
            // the ~150-250mm range actually tested so far; adjust here
            // (or in the widget's "more" panel) if real-world max/out-
            // of-range behavior turns out to differ.
            range: {floor: 0, ceiling: 1200},
        },
        // Firmware side: pins.py's GROVE_SENSOR_CATALOG entry 2.
        2: {
            label: 'Temp & Humidity',
            deviceId: 'DHT11',
            tested: true,
            // Single-wire digital, not I2C - unlike every sensor above,
            // this one needs to know which GPIO pin it's wired to, since
            // there's no shared bus to find it on. needsPin shows a pin
            // field in the widget's "more" panel (see GroveSensor.js's
            // remapSensor()/template.js) and gets sent along with the
            // subscribe request (StandardFirmataModel.js's setIOMode).
            needsPin: true,
            readings: [
                {key: 'temperature', label: 'Temp', unit: '°C'},
                {key: 'humidity', label: 'Humidity', unit: '%'},
            ],
            // Temperature (DHT11 spec: 0-50°C) and humidity (20-90% RH)
            // are different units on very different scales, but this
            // widget only has one shared input range for every reading
            // (same constraint the accelerometer's X/Y/Z share above) -
            // 0-100 is a rough compromise covering both reasonably rather
            // than either being precisely calibrated. If you only care
            // about one of the two readings, narrow this range for that
            // one in the "more" panel (it'll then over/under-scale the
            // other).
            range: {floor: 0, ceiling: 100},
            // Matches `range` above (0-100) exactly, making the scale a
            // 1:1 passthrough - so the outlets read the actual
            // temperature/humidity numbers directly instead of NTK's
            // usual 0-1023 convention, which would otherwise need mental
            // math (divide by ~10.23) to get back to a real-world value.
            outputRange: {floor: 0, ceiling: 100},
        },
    };
});
