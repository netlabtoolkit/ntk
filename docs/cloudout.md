# CloudOut

The CloudOut widget publishes its incoming value to an [MQTT](https://en.wikipedia.org/wiki/MQTT) topic on any broker whenever it changes - use it to send data to another device, script, cloud dashboard, or automation.

## How it works

- Wire a widget into CloudOut's inlet (left edge). CloudOut connects to the broker at **host**/**port** and publishes to **topic**.
- The checkbox on the right edge turns sending on and off. **It is off by default** - nothing is sent until you check it, and CloudOut never auto-reconnects on its own when a patch loads, even if it was checked when the patch was saved.
- The upper display shows the incoming value. The lower display shows the last value CloudOut actually sent, and stays on that number (with a brief green flash marking the moment) until the next real send - it does not continuously track the incoming value the way the upper display does.
- The dial in the widget body lets you **send test messages by hand** - drag it to publish a value (0-1023) without wiring anything into the inlet. Use it to confirm the receiving side is set up correctly before building the rest of the patch.
- CloudOut only sends when the value actually changes. Sending the same value twice in a row produces just one message.

## Settings ("more" panel)

- **host** - the broker's address (e.g. `io.adafruit.com`, or a LAN IP for a broker on your own network).
- **port** - the broker's port. `1883` is the standard plain (non-TLS) MQTT port; `8883` is the standard TLS port.
- **topic** - the MQTT topic to publish to.
- **TLS** - check this if the broker requires an encrypted connection. Leave it off for a plain local broker; most self-hosted brokers (e.g. Mosquitto) don't require it, but some hosted services do.
- **user** / **pass** - credentials, if the broker requires them. Leave blank for a broker that allows anonymous connections.
- **min ms** - the minimum time, in milliseconds, between actual sends (default `2000`). Rate-limited services (Adafruit IO's free tier allows 30 points/minute) need this set comfortably above their limit; set to `0` to send on every change with no minimum.
- **avg** - when checked, and **min ms** is above `0`, CloudOut publishes the *mean* of every value it saw during that interval instead of just whatever value happened to be current when the interval closed. Useful for a noisy or fast-changing input where you want a representative value rather than a snapshot. Once the input stops changing, CloudOut sends one more message with the exact final value (not an average) so the last thing published always matches where the input actually settled.

## Sharing a broker with CloudIn

CloudIn and CloudOut widgets pointed at the same **host**/**port** share one underlying connection to that broker, so you don't need a separate connection per widget.

The first widget to actually connect sets the username/password/TLS for that shared connection - if you point two widgets at the same broker with different credentials, whichever connects first wins for the rest of that session. Remove and re-add a widget to force a fresh connection attempt with corrected credentials.

**Don't point CloudOut and CloudIn at the same topic on the same broker in one patch.** MQTT has no way to tell a client "don't deliver my own published messages back to me," so a connection that both publishes and subscribes to one topic sees its own messages as if they'd arrived from somewhere else. NTK detects and suppresses this to avoid a feedback loop, which as a side effect means a CloudIn on the same topic will never receive anything. Use two different topics (or two feeds, if you're using Adafruit IO) for two-way testing.

## Connecting to Adafruit IO

Adafruit IO's MQTT broker works like any other:

1. Create a free account and a feed at [io.adafruit.com](https://io.adafruit.com) (**Feeds** → **+ New Feed**).
2. Set **host** to `io.adafruit.com` and **port** to `1883` (or `8883` with **TLS** checked).
3. Set **topic** to `USERNAME/feeds/FEEDKEY` - your username is shown in the upper right of the dashboard; the feed key is shown on the feed's own page (usually the lowercase, dashed version of the feed's display name). Adafruit IO rejects a topic in any other format.
4. Set **user** to your Adafruit IO username and **pass** to your account's Active Key (find it under your account icon → **My Key**).
5. Set **min ms** to at least `2000` to stay under the free tier's rate limit.
6. Check the CloudOut checkbox.

## Troubleshooting

- **Stays "Not connected"** - double check **host**/**port**/**TLS** match the broker exactly, and that **user**/**pass** are correct if the broker requires them.
- **Connects, then immediately disconnects, repeatedly** - on Adafruit IO specifically, check their dashboard's own MQTT error log (visible on the feed's page) for the exact reason; a malformed **topic** (not `USERNAME/feeds/FEEDKEY`) is a common cause, and the broker drops the whole connection rather than just rejecting that one message.
- **Getting rate-limited** - raise **min ms**, and check **avg** if you want a representative value from a fast-changing input rather than whatever it happened to be at the last instant.
- **The receiver never sees an initial value on startup** - CloudOut only sends on change; nudge the input so a real change happens.

## What changed

Earlier versions of CloudOut only spoke to Adafruit IO's REST API. CloudOut now uses MQTT and works with any broker; the old **username**/**AIO key**/**feed name** fields are replaced by **host**/**port**/**TLS**/**topic**/**user**/**pass**, and **send every** is renamed **min ms**. **avg inputs** is back, working the same way it did before. If you were using Adafruit IO, see "Connecting to Adafruit IO" above for the equivalent new settings.
