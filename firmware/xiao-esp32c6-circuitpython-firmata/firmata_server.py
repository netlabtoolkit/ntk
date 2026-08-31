"""
A Firmata protocol server, implemented from scratch for CircuitPython.

Scope is deliberately narrow - digital I/O, analog input, PWM output, and
servo output - matching exactly what NTK's AnalogIn/AnalogOut/DigitalIn/
DigitalOut/Servo widgets use. Not implemented: generic I2C/one-wire
passthrough, stepper, string data, serial-passthrough. Instead, one small
custom sysex extension (GROVE_SENSOR_REQUEST/GROVE_SENSOR_REPLY, see
below) lets a NTK GroveSensor widget subscribe to specific sensors that
this firmware already knows how to read (see pins.py's
GROVE_SENSOR_CATALOG) using their existing CircuitPython drivers -
deliberately not a generic register-level passthrough, which would mean
reimplementing every sensor's driver logic in JavaScript on the host
instead of reusing the CircuitPython ones already here. Most catalog
entries are I2C sensors sharing the one board.I2C() bus (no pin needed),
but the same mechanism also covers single-wire digital sensors (e.g. a
DHT11) that need to know which GPIO pin they're wired to - see the
"needs_pin" catalog entries below.

Every byte sequence here was checked against server/node_modules/
firmata-io/lib/firmata.js in the NTK repo - the actual host-side parser
this talks to - rather than working from a general memory of the
Firmata spec, since subtle mismatches (wrong resolution byte, wrong
sysex framing) would silently fail to interoperate rather than raising
a clear error.
"""

import time

# Set to True to print every incoming pin-mode/digital/analog-write
# command as it's dispatched - useful when a widget's commands don't
# seem to be reaching a pin the way expected. Left False normally since
# analog writes can arrive at up to ~50/sec per pin and flood the
# console.
DEBUG_WIRE = False

# ---- Firmata wire protocol constants (byte-for-byte match to
# firmata-io's own constants - see module docstring) ----
DIGITAL_MESSAGE = 0x90
ANALOG_MESSAGE = 0xE0
REPORT_ANALOG = 0xC0
REPORT_DIGITAL = 0xD0
SET_PIN_MODE = 0xF4
REPORT_VERSION = 0xF9
SYSTEM_RESET = 0xFF
START_SYSEX = 0xF0
END_SYSEX = 0xF7

ANALOG_MAPPING_QUERY = 0x69
ANALOG_MAPPING_RESPONSE = 0x6A
CAPABILITY_QUERY = 0x6B
CAPABILITY_RESPONSE = 0x6C
PIN_STATE_QUERY = 0x6D
PIN_STATE_RESPONSE = 0x6E
EXTENDED_ANALOG = 0x6F
SERVO_CONFIG = 0x70
SAMPLING_INTERVAL = 0x7A
QUERY_FIRMWARE = 0x79

# Custom sysex extension (not part of the Firmata spec) - from the
# range Firmata reserves for user-defined commands (0x01-0x0F), since
# every other sysex ID above is a real standard Firmata code. Lets a
# GroveSensor widget subscribe to one of pins.py's GROVE_SENSOR_CATALOG
# entries and receive its readings, without a generic I2C passthrough -
# see the module docstring for why.
GROVE_SENSOR_REQUEST = 0x01  # host -> device
GROVE_SENSOR_REPLY = 0x02  # device -> host

GROVE_SUBSCRIBE = 1
GROVE_UNSUBSCRIBE = 2

GROVE_READINGS = 1
GROVE_STATUS = 2

GROVE_STATUS_OK = 1
GROVE_STATUS_ERROR = 2

# Pin modes - matches board.MODES in firmata-io exactly (these values are
# part of the wire protocol, not an internal implementation detail).
INPUT = 0x00
OUTPUT = 0x01
ANALOG = 0x02
PWM = 0x03
SERVO = 0x04
PULLUP = 0x0B
IGNORE = 0x7F

FIRMWARE_NAME = "CircuitPythonFirmata"
FIRMATA_MAJOR_VERSION = 2
FIRMATA_MINOR_VERSION = 6

DEFAULT_SAMPLING_INTERVAL_MS = 19  # matches firmata-io's own default

SERVO_PWM_FREQUENCY = 50  # standard hobby-servo update rate
SERVO_MIN_PULSE_US_DEFAULT = 544
SERVO_MAX_PULSE_US_DEFAULT = 2400

# Reported to the host via CAPABILITY_RESPONSE, and used here to scale
# CircuitPython's native 16-bit analogio/pwmio values down to match -
# these specific numbers (10-bit ADC, 8-bit PWM) mimic a classic Arduino
# Uno so this behaves exactly like a real Firmata device from NTK's side,
# rather than requiring NTK to know anything about ESP32-specific
# resolutions.
ADC_RESOLUTION_BITS = 10
PWM_RESOLUTION_BITS = 8


class _Pin:
    """One Firmata pin's live state - which CircuitPython object (if any)
    currently owns the physical pin, its Firmata mode, and cached value."""

    def __init__(self, board_pin, analog_channel=None, virtual_read=None):
        self.board_pin = board_pin  # None for a "virtual" pin - see virtual_read
        self.analog_channel = analog_channel  # None if not analog-capable
        # For a pin with no real board_pin (e.g. one axis of an I2C sensor
        # exposed as if it were an analog input - see pins.py and
        # _VirtualAnalogIn below): a zero-arg function returning a raw
        # 16-bit value (0-65535), called instead of sampling analogio.
        self.virtual_read = virtual_read
        self.mode = None
        self.io = None  # the live digitalio/analogio/pwmio/_VirtualAnalogIn object, or None
        self.report = False
        self.value = 0
        self.servo_min_us = SERVO_MIN_PULSE_US_DEFAULT
        self.servo_max_us = SERVO_MAX_PULSE_US_DEFAULT


class _VirtualAnalogIn:
    """Duck-types analogio.AnalogIn's read-only 16-bit `.value` property
    and its deinit(), computed by calling a pin's virtual_read() instead
    of sampling a real ADC - lets update()'s existing ANALOG polling loop
    (and release_all_pins()) treat a sensor-derived reading exactly like a
    real analog pin, with no special-casing anywhere except
    _handle_report_analog, where this gets constructed."""

    def __init__(self, virtual_read):
        self._virtual_read = virtual_read

    @property
    def value(self):
        return self._virtual_read()

    def deinit(self):
        pass  # nothing to release - not a real hardware peripheral


class FirmataServer:
    def __init__(self, pin_table, grove_sensor_catalog=None):
        """pin_table: list of (board_pin_object_or_None, analog_channel_or_None,
        virtual_read_or_None) tuples, in Firmata pin-index order - index 0
        is Firmata pin 0, etc. board_pin is None for a "virtual" pin (see
        pins.py), which must then supply virtual_read instead.

        grove_sensor_catalog: dict of sensor_id -> {"read": fn() -> list
        of floats, "min_interval_ms": int}, see pins.py's
        GROVE_SENSOR_CATALOG - the sensors reachable via
        GROVE_SENSOR_REQUEST/GROVE_SENSOR_REPLY."""
        self.pins = [_Pin(bp, ac, vr) for (bp, ac, vr) in pin_table]
        num_ports = (len(self.pins) + 7) // 8
        self.port_state = [0] * num_ports
        self.sampling_interval_ms = DEFAULT_SAMPLING_INTERVAL_MS
        self._last_report_ms = 0
        self._send = None
        self._rx_buffer = bytearray()
        self._in_sysex = False
        self.grove_sensor_catalog = grove_sensor_catalog or {}
        # Grove sensor ids a client has subscribed to, each mapped to
        # when it was last reported so update() can honor that sensor's
        # own min_interval_ms.
        self._grove_subscriptions = {}

    # ---------------- connection lifecycle ----------------

    def on_connect(self, send):
        """Call once right after a client connects. `send` must be a
        function(bytes) that writes to the socket.

        Deliberately does NOT send REPORT_VERSION proactively. Reading
        server/node_modules/firmata-io/lib/firmata.js directly: its
        Board constructor only ever calls queryFirmware() (which is
        what starts queryCapabilities -> queryAnalogMapping -> the
        "ready" event) from a one-shot 5-second "haven't heard a
        version yet" fallback timer, gated on `versionReceived ===
        false` at that moment. If we answer with our version
        immediately on connect, versionReceived flips true well before
        that timer fires, its guard is false, it does nothing, and
        nothing else in that file ever calls queryFirmware - so
        "ready" (and therefore every widget, which all wait on it)
        never fires, even though the TCP connection looks fine.
        Staying silent lets that 5-second timeout be the thing that
        kicks off the whole handshake, which our REPORT_VERSION byte
        handler in _feed_byte and QUERY_FIRMWARE sysex handler in
        _dispatch_sysex already answer correctly."""
        self._send = send

    # ---------------- incoming byte stream ----------------

    def feed(self, data):
        """Feed raw bytes as they arrive from the socket. Safe to call
        with partial messages split across TCP packets - state persists
        across calls."""
        for byte in data:
            self._feed_byte(byte)

    def _feed_byte(self, byte):
        # Deliberately never mutates self._rx_buffer in place to "empty"
        # it (neither .clear() nor del buf[:] are supported by
        # CircuitPython's bytearray - confirmed on real hardware).
        # Reassigning a fresh bytearray() is the one approach that's
        # universally safe.
        if self._in_sysex:
            self._rx_buffer.append(byte)
            if byte == END_SYSEX:
                payload = bytes(self._rx_buffer[1:-1])
                self._rx_buffer = bytearray()
                self._in_sysex = False
                self._dispatch_sysex(payload)
            return

        if byte == START_SYSEX:
            self._rx_buffer = bytearray([byte])
            self._in_sysex = True
            return

        if byte == REPORT_VERSION:
            self._send_report_version()
            return

        if byte == SYSTEM_RESET:
            self._handle_system_reset()
            return

        if not self._rx_buffer:
            if byte >= 0x80:
                self._rx_buffer = bytearray([byte])
            # else: stray data byte with no command in progress - ignore,
            # a bad read shouldn't be able to wedge the parser forever.
            return

        self._rx_buffer.append(byte)
        expected_len = self._expected_length(self._rx_buffer[0])
        if expected_len and len(self._rx_buffer) >= expected_len:
            command = bytes(self._rx_buffer)
            self._rx_buffer = bytearray()
            self._dispatch_command(command)

    def _expected_length(self, first_byte):
        if first_byte == SET_PIN_MODE:
            return 3
        top = first_byte & 0xF0
        if top == 0x90 or top == 0xE0:  # DIGITAL_MESSAGE, ANALOG_MESSAGE
            return 3
        if top == 0xC0 or top == 0xD0:  # REPORT_ANALOG, REPORT_DIGITAL
            return 2
        return None

    def _dispatch_command(self, buf):
        first = buf[0]
        if first == SET_PIN_MODE:
            if DEBUG_WIRE:
                print("DEBUG SET_PIN_MODE pin", buf[1], "mode", buf[2])
            self._apply_pin_mode(buf[1], buf[2])
            return
        top = first & 0xF0
        if top == 0x90:
            if DEBUG_WIRE:
                print("DEBUG DIGITAL_MESSAGE port", first & 0x0F, "value", buf[1] | (buf[2] << 7))
            self._handle_digital_message(first & 0x0F, buf[1] | (buf[2] << 7))
        elif top == 0xE0:
            if DEBUG_WIRE:
                print("DEBUG ANALOG_MESSAGE(write) pin", first & 0x0F, "value", buf[1] | (buf[2] << 7))
            self._handle_analog_write(first & 0x0F, buf[1] | (buf[2] << 7))
        elif top == 0xC0:
            self._handle_report_analog(first & 0x0F, buf[1])
        elif top == 0xD0:
            self._handle_report_digital(first & 0x0F, buf[1])

    def _dispatch_sysex(self, payload):
        if not payload:
            return
        cmd = payload[0]
        if cmd == QUERY_FIRMWARE:
            self._send_query_firmware_response()
        elif cmd == CAPABILITY_QUERY:
            self._send_capability_response()
        elif cmd == ANALOG_MAPPING_QUERY:
            self._send_analog_mapping_response()
        elif cmd == PIN_STATE_QUERY:
            self._send_pin_state_response(payload[1])
        elif cmd == SERVO_CONFIG:
            pin_index = payload[1]
            min_us = payload[2] | (payload[3] << 7)
            max_us = payload[4] | (payload[5] << 7)
            self._handle_servo_config(pin_index, min_us, max_us)
        elif cmd == EXTENDED_ANALOG:
            pin_index = payload[1]
            value = 0
            for i, b in enumerate(payload[2:]):
                value |= (b & 0x7F) << (7 * i)
            self._handle_analog_write(pin_index, value)
        elif cmd == SAMPLING_INTERVAL:
            interval = payload[1] | (payload[2] << 7)
            self.sampling_interval_ms = max(1, interval)
        elif cmd == GROVE_SENSOR_REQUEST:
            self._handle_grove_sensor_request(payload[1:])
        # Anything else (generic I2C/string/one-wire/stepper) - out of scope, ignore.

    # ---------------- outgoing responses ----------------

    def _send_report_version(self):
        self._send(bytes([REPORT_VERSION, FIRMATA_MAJOR_VERSION, FIRMATA_MINOR_VERSION]))

    def _send_query_firmware_response(self):
        data = [START_SYSEX, QUERY_FIRMWARE, FIRMATA_MAJOR_VERSION, FIRMATA_MINOR_VERSION]
        for ch in FIRMWARE_NAME:
            code = ord(ch)
            data.append(code & 0x7F)
            data.append((code >> 7) & 0x7F)
        data.append(END_SYSEX)
        self._send(bytes(data))

    def _send_capability_response(self):
        data = [START_SYSEX, CAPABILITY_RESPONSE]
        for pin in self.pins:
            data.append(INPUT)
            data.append(1)
            data.append(OUTPUT)
            data.append(1)
            data.append(PULLUP)
            data.append(1)
            data.append(PWM)
            data.append(PWM_RESOLUTION_BITS)
            data.append(SERVO)
            data.append(14)
            if pin.analog_channel is not None:
                data.append(ANALOG)
                data.append(ADC_RESOLUTION_BITS)
            data.append(0x7F)  # terminates this pin's mode list
        data.append(END_SYSEX)
        self._send(bytes(data))

    def _send_analog_mapping_response(self):
        data = [START_SYSEX, ANALOG_MAPPING_RESPONSE]
        for pin in self.pins:
            data.append(pin.analog_channel if pin.analog_channel is not None else 0x7F)
        data.append(END_SYSEX)
        self._send(bytes(data))

    def _send_pin_state_response(self, pin_index):
        if pin_index < 0 or pin_index >= len(self.pins):
            return
        pin = self.pins[pin_index]
        mode = pin.mode if pin.mode is not None else INPUT
        state = pin.value
        self._send(bytes([
            START_SYSEX, PIN_STATE_RESPONSE, pin_index, mode,
            state & 0x7F, (state >> 7) & 0x7F, (state >> 14) & 0x7F,
            END_SYSEX,
        ]))

    def _send_digital_port(self, port):
        value = self.port_state[port]
        self._send(bytes([DIGITAL_MESSAGE | port, value & 0x7F, (value >> 7) & 0x7F]))

    def _send_analog_value(self, pin_index):
        pin = self.pins[pin_index]
        self._send(bytes([
            ANALOG_MESSAGE | pin.analog_channel,
            pin.value & 0x7F,
            (pin.value >> 7) & 0x7F,
        ]))

    def _encode_grove_value(self, value):
        # Fixed-point: x100 for 2 decimal places, then packed as 3x 7-bit
        # bytes LSB-first (21-bit signed range, +/-10485.76 - comfortably
        # covers anything in GROVE_SENSOR_CATALOG). Same style as Firmata's
        # own multi-byte sysex values elsewhere in this protocol.
        fixed = int(round(value * 100))
        fixed &= 0x1FFFFF  # wrap into 21 bits rather than raise on overflow
        return (fixed & 0x7F, (fixed >> 7) & 0x7F, (fixed >> 14) & 0x7F)

    def _send_grove_reading(self, sensor_id, values):
        data = [GROVE_SENSOR_REPLY, GROVE_READINGS, sensor_id & 0x7F, (sensor_id >> 7) & 0x7F, len(values)]
        for value in values:
            data.extend(self._encode_grove_value(value))
        self._send(bytes([START_SYSEX]) + bytes(data) + bytes([END_SYSEX]))

    def _send_grove_status(self, sensor_id, status):
        self._send(bytes([
            START_SYSEX, GROVE_SENSOR_REPLY, GROVE_STATUS,
            sensor_id & 0x7F, (sensor_id >> 7) & 0x7F, status,
            END_SYSEX,
        ]))

    # ---------------- pin mode / hardware resource management ----------------

    def _release_pin_io(self, pin):
        # CircuitPython requires a pin's previous digitalio/analogio/pwmio
        # object to be explicitly deinit'd before the same physical pin
        # can be claimed by a new one - unlike Arduino, where pin mode is
        # just a register write.
        if pin.io is not None:
            try:
                pin.io.deinit()
            except Exception:
                pass
            pin.io = None

    def release_all_pins(self):
        """Call this once a connection ends. Each TCP connection gets a
        fresh FirmataServer with no memory of what a previous connection
        claimed - without this, a pin an earlier connection put into
        ANALOG/PWM/SERVO/etc. mode stays claimed at the CircuitPython
        runtime level forever (deinit is never implicit on garbage
        collection here), and the next connection's claim attempt fails
        as "in use" even though nothing is currently using it."""
        for pin in self.pins:
            self._release_pin_io(pin)

        # A "needs_pin" Grove sensor (e.g. DHT11) claims its pin through
        # its own driver object, not pin.io, so the loop above doesn't
        # reach it - without this, its pin stays claimed after a dropped
        # connection, same "in use" failure the comment above describes.
        for sensor_id in list(self._grove_subscriptions.keys()):
            self._unsubscribe_grove_sensor(sensor_id)

    def _apply_pin_mode(self, pin_index, mode):
        if pin_index < 0 or pin_index >= len(self.pins):
            return
        pin = self.pins[pin_index]
        self._release_pin_io(pin)
        pin.mode = mode
        pin.report = False

        if pin.board_pin is None:
            # A "virtual" pin (e.g. one axis of an I2C sensor - see
            # pins.py) has no real pin to put into INPUT/OUTPUT/PWM/SERVO
            # mode. ANALOG is the only mode that makes sense for it, and
            # that's handled entirely in _handle_report_analog, not here -
            # so just ignore anything else instead of crashing on
            # digitalio.DigitalInOut(None).
            if mode not in (ANALOG, IGNORE):
                print("Pin", pin_index, "has no physical pin - mode", mode, "not applicable")
                pin.mode = None
            return

        import digitalio

        try:
            if mode == INPUT:
                io = digitalio.DigitalInOut(pin.board_pin)
                io.switch_to_input(pull=digitalio.Pull.DOWN)
                pin.io = io
            elif mode == PULLUP:
                io = digitalio.DigitalInOut(pin.board_pin)
                io.switch_to_input(pull=digitalio.Pull.UP)
                pin.io = io
            elif mode == OUTPUT:
                io = digitalio.DigitalInOut(pin.board_pin)
                io.switch_to_output(value=False)
                pin.io = io
            elif mode == PWM:
                import pwmio
                pin.io = pwmio.PWMOut(pin.board_pin, frequency=1000, duty_cycle=0)
            elif mode == SERVO:
                import pwmio
                pin.io = pwmio.PWMOut(pin.board_pin, frequency=SERVO_PWM_FREQUENCY, duty_cycle=0)
            # mode == ANALOG is deliberately not handled here - see
            # _handle_report_analog for why.
            # mode == IGNORE (0x7F) or anything else: leave the pin unclaimed.
        except (ValueError, RuntimeError) as e:
            # A pin can legitimately be unusable in a given mode on real
            # hardware (no PWM/LEDC channel free, not a valid pin for
            # this peripheral, etc.) - keep the connection alive instead
            # of crashing the whole server over one pin.
            print("Pin", pin_index, "rejected for mode", mode, "on this board:", e)
            pin.mode = None

    def _handle_digital_message(self, port, port_value):
        # The host always sends a whole port's 8-bit value, not a single
        # pin - apply it to whichever pins in that port are OUTPUTs and
        # leave the rest alone, same as a real Firmata device would.
        base = port * 8
        for bit in range(8):
            pin_index = base + bit
            if pin_index >= len(self.pins):
                break
            pin = self.pins[pin_index]
            if pin.mode == OUTPUT and pin.io is not None:
                bit_value = (port_value >> bit) & 0x01
                pin.io.value = bool(bit_value)
                pin.value = bit_value

    def _handle_analog_write(self, pin_index, value):
        if pin_index < 0 or pin_index >= len(self.pins):
            return
        pin = self.pins[pin_index]
        pin.value = value
        if pin.mode == PWM and pin.io is not None:
            duty = int(min(max(value, 0), 255) / 255 * 65535)
            pin.io.duty_cycle = duty
        elif pin.mode == SERVO and pin.io is not None:
            # johnny-five's own Servo component (what NTK's Servo widget
            # uses under the hood) converts degrees to a microsecond pulse
            # width itself before sending - server/node_modules/
            # johnny-five/lib/servo.js maps degrees through its pwmRange
            # (600-2400us by default) and calls servoWrite() with THAT
            # microsecond value, not the raw 0-180 angle. Re-interpreting
            # it as an angle here (the previous behavior) clamped every
            # write to the 0-180 range, so a value like 1500 (a valid
            # mid-range microsecond pulse) became angle=180 every time -
            # the servo jumped to one extreme and then never moved again
            # regardless of the actual dial position. Treat the incoming
            # value as the pulse width directly instead.
            pulse_us = min(max(value, pin.servo_min_us), pin.servo_max_us)
            period_us = 1000000 / SERVO_PWM_FREQUENCY
            pin.io.duty_cycle = int(pulse_us / period_us * 65535)

    def _handle_report_analog(self, channel, enabled):
        # Unlike every other mode, ANALOG is never set via SET_PIN_MODE -
        # firmata-io's pinMode(ANALOG) is pure local bookkeeping on the
        # host side and sends nothing over the wire. What actually
        # arrives here is REPORT_ANALOG, sent when analogRead() is first
        # called - so pin setup has to happen here instead.
        pin_index = None
        for i, p in enumerate(self.pins):
            if p.analog_channel == channel:
                pin_index = i
                break
        if pin_index is None:
            return
        pin = self.pins[pin_index]
        print(("Client requested" if enabled else "Client stopped") + " analog readings from A" + str(channel))
        if enabled:
            self._release_pin_io(pin)
            if pin.board_pin is None:
                # Virtual pin (e.g. an accelerometer axis - see pins.py) -
                # value comes from virtual_read(), not a real analogio
                # channel. Absent entirely (not even attempted) if the
                # sensor wasn't found at boot - see pins.py.
                if pin.virtual_read is not None:
                    pin.io = _VirtualAnalogIn(pin.virtual_read)
                    pin.mode = ANALOG
                    pin.report = True
                else:
                    print("Pin", pin_index, "(analog channel", channel, ") has no physical pin and no virtual reader - nothing to report")
                    pin.mode = None
                    pin.report = False
                return
            import analogio
            try:
                pin.io = analogio.AnalogIn(pin.board_pin)
                pin.mode = ANALOG
                pin.report = True
            except ValueError as e:
                # Some pins listed as analog-capable in pins.py may not
                # actually have a working ADC channel on this specific
                # chip (seen on real XIAO ESP32-C6 hardware: channel 4
                # raised "Invalid pin" here). Leave the pin unclaimed and
                # keep the connection alive instead of crashing the whole
                # server over one bad pin.
                print("Pin", pin_index, "(analog channel", channel, ") rejected by analogio - not usable as analog input on this board:", e)
                pin.mode = None
                pin.report = False
        else:
            self._release_pin_io(pin)
            pin.mode = None
            pin.report = False

    def _handle_report_digital(self, port, enabled):
        print(("Client requested" if enabled else "Client stopped") + " digital readings from port " + str(port))
        base = port * 8
        for bit in range(8):
            pin_index = base + bit
            if pin_index >= len(self.pins):
                break
            self.pins[pin_index].report = bool(enabled)

    def _handle_grove_sensor_request(self, data):
        if len(data) < 3:
            return
        subcmd = data[0]
        sensor_id = data[1] | (data[2] << 7)

        if subcmd == GROVE_SUBSCRIBE:
            entry = self.grove_sensor_catalog.get(sensor_id)
            if entry is None:
                print("Client subscribed to unknown Grove sensor", sensor_id)
                self._send_grove_status(sensor_id, GROVE_STATUS_ERROR)
                return

            # Release whatever this sensor was previously using first -
            # matters for a "needs_pin" sensor being re-subscribed on a
            # different pin (the widget's pin field changed), so the old
            # pin claim doesn't linger.
            self._unsubscribe_grove_sensor(sensor_id)

            if entry.get("needs_pin"):
                # 4th byte is a Firmata pin index (see pins.py's PIN_TABLE/
                # self.pins) - added for sensors that aren't on the shared
                # I2C bus and need to know which GPIO they're wired to.
                if len(data) < 4 or data[3] >= len(self.pins) or self.pins[data[3]].board_pin is None:
                    print("Grove sensor", sensor_id, "needs a real pin, none given")
                    self._send_grove_status(sensor_id, GROVE_STATUS_ERROR)
                    return
                try:
                    read_fn, cleanup_fn = entry["make_read"](self.pins[data[3]].board_pin)
                except Exception as e:
                    print("Grove sensor", sensor_id, "failed to start on pin", data[3], ":", e)
                    self._send_grove_status(sensor_id, GROVE_STATUS_ERROR)
                    return
            else:
                read_fn, cleanup_fn = entry["read"], None

            # last_ms=0 forces update() to report on its very next pass,
            # rather than waiting a full min_interval_ms for the first
            # reading.
            self._grove_subscriptions[sensor_id] = {
                "last_ms": 0,
                "read": read_fn,
                "min_interval_ms": entry["min_interval_ms"],
                "cleanup": cleanup_fn,
            }
            print("Client subscribed to Grove sensor", sensor_id)
        elif subcmd == GROVE_UNSUBSCRIBE:
            if self._unsubscribe_grove_sensor(sensor_id):
                print("Client unsubscribed from Grove sensor", sensor_id)

    def _unsubscribe_grove_sensor(self, sensor_id):
        """Remove sensor_id's subscription, if any, releasing whatever
        pin/resource a "needs_pin" sensor's cleanup function claimed.
        Returns True if there was actually a subscription to remove."""
        subscription = self._grove_subscriptions.pop(sensor_id, None)
        if subscription is None:
            return False
        cleanup_fn = subscription.get("cleanup")
        if cleanup_fn is not None:
            try:
                cleanup_fn()
            except Exception:
                pass
        return True

    def _handle_servo_config(self, pin_index, min_us, max_us):
        if pin_index < 0 or pin_index >= len(self.pins):
            return
        pin = self.pins[pin_index]
        pin.servo_min_us = min_us
        pin.servo_max_us = max_us
        self._apply_pin_mode(pin_index, SERVO)

    def _handle_system_reset(self):
        for pin in self.pins:
            self._release_pin_io(pin)
            pin.mode = None
            pin.report = False
            pin.value = 0
        self.port_state = [0] * len(self.port_state)
        self._rx_buffer = bytearray()
        self._in_sysex = False

    # ---------------- periodic reporting ----------------

    def update(self):
        """Call this frequently (every loop iteration) - handles
        periodic analog/digital reporting at the configured sampling
        interval. A no-op between intervals."""
        now_ms = time.monotonic() * 1000
        if now_ms - self._last_report_ms < self.sampling_interval_ms:
            return
        self._last_report_ms = now_ms

        for i, pin in enumerate(self.pins):
            if pin.mode == ANALOG and pin.report and pin.io is not None:
                raw16 = pin.io.value  # 0-65535
                pin.value = raw16 >> (16 - ADC_RESOLUTION_BITS)
                self._send_analog_value(i)

        # StandardFirmata reports a whole port every sampling tick when
        # any pin in it has reporting enabled, not just on change.
        for port in range(len(self.port_state)):
            base = port * 8
            any_reporting = False
            port_value = 0
            for bit in range(8):
                pin_index = base + bit
                if pin_index >= len(self.pins):
                    break
                pin = self.pins[pin_index]
                if pin.mode in (INPUT, PULLUP) and pin.report and pin.io is not None:
                    any_reporting = True
                    bit_value = 1 if pin.io.value else 0
                    pin.value = bit_value
                    if bit_value:
                        port_value |= (1 << bit)
            if any_reporting:
                self.port_state[port] = port_value
                self._send_digital_port(port)

        for sensor_id, subscription in list(self._grove_subscriptions.items()):
            if now_ms - subscription["last_ms"] < subscription["min_interval_ms"]:
                continue
            try:
                values = subscription["read"]()
                self._send_grove_reading(sensor_id, values)
            except Exception as e:
                # A sensor read can legitimately fail transiently (I2C bus
                # hiccup, sensor not ready yet, or - for a "needs_pin"
                # sensor like DHT11 - a routine checksum/timing miss) -
                # report it to the client instead of crashing the whole
                # connection over one bad read, matching this file's
                # existing "keep the connection alive" convention (see
                # _apply_pin_mode's except clause).
                print("Grove sensor", sensor_id, "read failed:", e)
                self._send_grove_status(sensor_id, GROVE_STATUS_ERROR)
            subscription["last_ms"] = now_ms
