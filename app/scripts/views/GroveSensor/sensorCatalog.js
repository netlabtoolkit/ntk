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
    };
});
