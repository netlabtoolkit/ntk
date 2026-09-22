# CloudOut

The CloudOut widget periodically sends the widget's incoming numeric value to an [Adafruit IO](https://io.adafruit.com) feed.

## How it works

- Check the checkbox on the widget to start sending. The widget counts down ("Send in: Ns") between checks, and briefly flashes red when it actually sends a value.
- CloudOut only sends when the value has *changed* since the last send, and won't send more than once per "send every" interval even if the value keeps changing - so it won't spam the feed with a repeated, unchanged value, or send updates faster than the interval you've set.
- With **avg inputs** checked, CloudOut averages every value it receives during a send interval instead of just using whatever value arrived last; leave it unchecked to send the latest value as-is.
- If a send fails, sending stops automatically (the checkbox unchecks itself) and the widget's display explains why - see Troubleshooting below.

## Settings ("more" panel)

- **avg inputs** - checkbox, see above.
- **send every** - how often, in milliseconds, to check for and send a changed value (default `10000` = 10 seconds).
- **username** - your Adafruit IO account username.
- **AIO key** - your Adafruit IO account's active key.
- **feed name** - the name of the specific feed to write to.

## Getting your Adafruit IO username, key, and feed name

CloudOut talks to [io.adafruit.com](https://io.adafruit.com), Adafruit's cloud data service (free tier available). You'll need a free Adafruit account, plus these three pieces of information from it:

1. **Create an account and a feed**
   Sign up or log in at [io.adafruit.com](https://io.adafruit.com). Click **Feeds** in the left sidebar, then **+ New Feed**, and give it a name (e.g. "temperature"). Adafruit IO generates a URL-safe feed key from that name automatically.

2. **Find your username**
   It's shown in the upper right of the Adafruit IO dashboard, and it's also the first segment of any of your feed URLs: `io.adafruit.com/USERNAME/feeds/...`

3. **Find your AIO Key**
   Click your account icon, then **My Key**. This shows your **Active Key** - a long string. Treat it like a password: anyone with it can read and write your feeds.

4. **Find your feed name**
   On the feed's own page, the feed's identifier is shown under its name, and is also the last segment of the feed's URL. It's usually the lowercase, dashed version of whatever name you gave the feed (a feed named "Kitchen Temp" gets the key `kitchen-temp`) - enter that exact value into CloudOut's "feed name" field, not the display name, if the two differ.

Enter those three values into CloudOut's "more" panel: **username**, **AIO key**, **feed name**.

## Troubleshooting

- **"Invalid key"** - the AIO Key is wrong, or was regenerated on the Adafruit IO site (regenerating immediately invalidates the old key).
- **"Invalid feed"** - the feed name doesn't match any feed under that username. Double-check for typos, and make sure you're using the feed's key/URL-slug, not its display name (see step 4 above).
- **"Can't connect"** - a network problem, a timeout, or Adafruit IO is temporarily unreachable.
- Any of the above stops sending - fix the setting, then re-check the box to retry.
- Adafruit IO's free tier is rate-limited (30 data points/minute as of this writing) - don't set "send every" faster than you need to, especially with "avg inputs" off and a fast-changing input.

## What changed

Earlier versions of CloudOut also supported data.sparkfun.com (via Phant) and particle.io, and later added thingspeak.com. All three have been removed - CloudOut now speaks to Adafruit IO only.
