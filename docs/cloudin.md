# CloudIn

The CloudIn widget subscribes to an [MQTT](https://en.wikipedia.org/wiki/MQTT) topic on any broker and sends incoming values out its outlet - use it to receive data published by another device, script, cloud service, or dashboard.

## How it works

- CloudIn connects to the broker at **host**/**port** and subscribes to **topic**. Updates push in immediately when a message arrives - there's no polling interval to configure.
- The checkbox on the left edge turns the widget on and off. **It is off by default** - check it to receive values.
- The widget's status line shows **Connected** or **Not connected**, reflecting whether the broker connection is actually up.
- The raw incoming value is shown in the upper display, scaled to the output range set by the two range fields, and sent out the outlet (shown in the lower display).
- The dial in the widget body lets you **simulate an incoming message** - drag it to send a test value (0-1023) out the outlet without a broker connected at all. Use it to build and verify the rest of your patch before the sender is set up.

## Settings ("more" panel)

- **host** - the broker's address (e.g. `io.adafruit.com`, or a LAN IP for a broker on your own network).
- **port** - the broker's port. `1883` is the standard plain (non-TLS) MQTT port; `8883` is the standard TLS port.
- **topic** - the MQTT topic to subscribe to.
- **TLS** - check this if the broker requires an encrypted connection. Leave it off for a plain local broker; most self-hosted brokers (e.g. Mosquitto) don't require it, but some hosted services do.
- **user** / **pass** - credentials, if the broker requires them. Leave blank for a broker that allows anonymous connections.

## Sharing a broker with CloudOut

CloudIn and CloudOut widgets pointed at the same **host**/**port** share one underlying connection to that broker, so you don't need a separate connection per widget.

The first widget to actually connect sets the username/password/TLS for that shared connection - if you point two widgets at the same broker with different credentials, whichever connects first wins for the rest of that session. Remove and re-add a widget to force a fresh connection attempt with corrected credentials.

**Don't point CloudIn and CloudOut at the same topic on the same broker in one patch.** MQTT has no way to tell a client "don't deliver my own published messages back to me," so a connection that both publishes and subscribes to one topic sees its own messages as if they'd arrived from somewhere else. NTK detects and suppresses this to avoid a feedback loop, which as a side effect means CloudIn will never receive anything on a topic CloudOut is also publishing to. Use two different topics (or two feeds, if you're using Adafruit IO) for two-way testing.

## Connecting to Adafruit IO

Adafruit IO's MQTT broker works like any other:

1. Create a free account and a feed at [io.adafruit.com](https://io.adafruit.com) (**Feeds** → **+ New Feed**).
2. Set **host** to `io.adafruit.com` and **port** to `1883` (or `8883` with **TLS** checked).
3. Set **topic** to `USERNAME/feeds/FEEDKEY` - your username is shown in the upper right of the dashboard; the feed key is shown on the feed's own page (usually the lowercase, dashed version of the feed's display name).
4. Set **user** to your Adafruit IO username and **pass** to your account's Active Key (find it under your account icon → **My Key**).
5. Check the CloudIn checkbox.

## Troubleshooting

- **Stays "Not connected"** - double check **host**/**port**/**TLS** match the broker exactly, and that **user**/**pass** are correct if the broker requires them.
- **Shows "Connected" but nothing ever arrives** - confirm **topic** exactly matches what's being published (topics are case-sensitive), and that something is actually publishing to it. Also check you're not pointed at the same topic as a CloudOut in the same patch (see above).
- **Adafruit IO specifically rejects the connection** - check their dashboard's own MQTT error log (visible on the feed's page) for the exact reason; a malformed topic (not `USERNAME/feeds/FEEDKEY`) is a common cause.
- **The value jumps to a huge number** - the incoming values are outside the output range you've set; adjust the range fields to match what's actually being published.

## What changed

Earlier versions of CloudIn only spoke to Adafruit IO's REST API, polling on a fixed interval. CloudIn now uses MQTT and works with any broker, updates push in immediately instead of on a timer, and the old **username**/**AIO key**/**feed name** fields are replaced by **host**/**port**/**TLS**/**topic**/**user**/**pass**. If you were using Adafruit IO, see "Connecting to Adafruit IO" above for the equivalent new settings.
