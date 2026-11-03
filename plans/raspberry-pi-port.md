# Raspberry Pi port

**Status:** direction, not started (2026-11-03). Long term, Phil wants to move the device firmware system to a Raspberry Pi, and later run some of the AI widgets locally on the Pi. Phil has a Pi 5 (8 GB) and has already run Ollama tool calling on it ([write-up](https://philvanallen.substack.com/p/local-llm-with-tool-calling-on-rpi)).

**Why:** a patch that runs on one small box, sensing, deciding and acting, with no Mac attached. The CircuitPython boards can run a patch standalone today, but they can't run any AI model.

## What "port to the Pi" can mean

These are different projects with different costs. They can be done in any order, and they combine.

| | the Pi is... | NTK on the Mac | what has to be built |
|---|---|---|---|
| **A. AI server** | an Ollama box on the network | unchanged; LLM / Decide point their address at the Pi | nothing (works now; Phil is measuring) |
| **B. The device** | a replacement for the XIAO / Pico | connects to it over WiFi Firmata as today | the firmware running under Linux (below) |
| **C. A hub** | runs the patch and the AI; XIAO boards stay as wireless I/O | builds and deploys the patch | B, plus the standalone interpreter talking to the boards as clients |
| **D. All of NTK** | runs the NTK app itself, with a screen | not needed | an NTK build for Linux arm64 |

**C may be the best end state.** The Pi is weak at exactly what the XIAO is good at (analog inputs, steady PWM, instant boot, surviving a pulled plug), and the XIAO can't do what the Pi can (AI models, a camera at speed, lots of memory). Let each do its part: the Pi as the brain, XIAO boards as cheap, wireless, rugged I/O.

## B. The firmware on the Pi

### What carries over

Most of the firmware is plain Python and should run under CPython unchanged: `standalone_interpreter.py` (the widget chains, easing, Boolean / Gate / Mix, Scene through `scene_script.py`), the Firmata protocol in `firmata_server.py`, `withrottle.py`.

### What's CircuitPython-only, and what replaces it

| today (CircuitPython) | on the Pi (Linux, CPython) |
|---|---|
| `board`, `digitalio`, `pwmio`, `busio`, `analogio` | [Adafruit Blinka](https://github.com/adafruit/Adafruit_Blinka): the CircuitPython hardware API on Linux, so pin code mostly carries over |
| `wifi`, `socketpool` | plain `socket`; the OS handles WiFi |
| `microcontroller.reset`, `supervisor`, `watchdog`, the reset-loop guard | a systemd service with `Restart=always` and a watchdog |
| `storage` (the board's USB drive), Push / Pull to it | plain files; Push / Pull over the network (already exists) |
| `.mpy` compiling with `mpy-cross` | not needed |
| `settings.toml` via `os.getenv` | the same file, read with `tomllib` |
| `mdns` | avahi (part of Raspberry Pi OS) |
| `boot.py` escape hatch | not needed (ssh in) |
| `microosc`, `adafruit_minimqtt` | the same pure-Python libraries, or python-osc / paho-mqtt |
| SSD1306 OLED via `displayio` | Blinka's displayio support, or drop the OLED (the Pi can show status on a screen or over ssh) |

**Approach:** one source tree, not a fork. Put the few platform-specific calls (network, reset, storage, settings) behind a small platform module, one version for CircuitPython and one for Linux, so the XIAO and the Pi run the same interpreter and Firmata code.

### Hardware differences to plan for

- **No analog inputs.** The Pi has no ADC. AnalogIn needs an add-on: an ADS1115 board, or a Grove Base Hat for Raspberry Pi (which has one). Pin names in NTK map to its channels.
- **Little hardware PWM.** Two hardware PWM channels; software PWM jitters, which shows on servos. Servos probably go through a PCA9685 board. AnalogOut LED dimming on software PWM may flicker.
- **NeoPixel** on a Pi 5 needs its own driver (the Pi 5's GPIO goes through the RP1 chip; older Pi NeoPixel libraries don't work on it). Check the current Adafruit library before relying on it.
- **Linux isn't real-time.** Sensors that time pulses in software (DHT11, the Grove ultrasonic ranger) are known to be flakier on Linux. Retest every Grove driver.
- **Boot time:** 20-40 s, against about 2 s for a XIAO.
- **Pulling the plug can corrupt the SD card.** For installations, Raspberry Pi OS's read-only overlay file system, or a clean shutdown button.
- **Power and size:** a 5 V / 5 A supply, against a USB cable for a XIAO.
- **A pin table for the Pi** (`pins.py`), so NTK's pin menus show the header's pins.

### First spike

Run `firmata_server.py` and the standalone interpreter under CPython + Blinka on the Pi 5, with a button, an LED and a pot (through an ADC), and connect from NTK on the Mac as to a XIAO. Measure input latency against the XIAO, and see how much of the CircuitPython-only code the platform module has to cover.

## AI on the Pi, widget by widget

| widget | runs today in / on | depends on | on a Pi | expectation |
|---|---|---|---|---|
| Gesture | NTK's window (JS) | DTW on sensor values, no model | port to Python | fine |
| PoseRecog, FaceTrack | NTK's window | MediaPipe tasks-vision (WASM), webcam | MediaPipe for Python (has 64-bit ARM packages), Pi camera or USB webcam | probably OK at a lower frame rate (not measured) |
| ObjectRecog | NTK's window | two MediaPipe models per frame (object detector + image embedder) | as above | the slowest of the vision widgets; possibly a few frames a second; an AI HAT could help |
| SpeechIn | Mac only | Apple's on-device speech recognizer (Swift helper) | replace: whisper.cpp or Vosk | works, but slower than Apple's recognizer |
| SpeechOut | Mac only | Apple's speech synthesizer (Swift helper) | replace: Piper | fine (Piper is built for the Pi) |
| LLM | NTK (`llmProxy.js`) | Anthropic / GreenPT / Ollama | hosted providers work from a Pi unchanged; local Ollama is slow | Phil's numbers: qwen2.5:1.5b ~5 s for a two-tool chain and unreliable, qwen2.5:7b ~30 s |
| Decide (planned) | NTK | Ollama `/v1/systemone` | unknown: on the Mac the decision models use Ollama's Apple-only MLX runner | Phil testing; on the Mac tev1:4b takes ~370 ms for 3 questions, and the Pi will be several times slower |
| LLM tool calling (idea) | | Ollama tools | | qwen2.5:1.5b took 190 ms for one call on the Mac; maybe a couple of seconds on the Pi (guess) |
| Sound recognition (planned) | | DTW on audio features | Python | fine |

The pattern: **small vision models and non-model logic should be fine; language models are where the Pi struggles.** A Pi 5 has roughly 1/15 of an M4 Pro's memory bandwidth, and generating text is bound by it. Decision models generate nothing but read the whole prompt once per question, which is bound by the CPU instead; how that comes out on the Pi is what Phil's tests will show.

## Rules for now, so the port stays possible

- **Keep every model call behind a provider and address setting** (the LLM widget does; Decide is planned to). A Pi patch can then do sensing, vision and logic locally and send language work to a Mac, a bigger box on the network, or a hosted model, without changing the patch.
- **Prefer portable pieces where one is good enough.** Where an Apple-only piece is clearly better (SpeechIn / SpeechOut), say so in the widget's doc.
- **The standalone export's compatibility check should know the target**: which widgets a Pi can run, which need the Mac, so an export says "SpeechIn needs the Mac" instead of failing on the device.
- **When widget logic lives in NTK's JS** (Gesture's DTW, the recognizers' matching), keep it simple and give it test vectors, so a Python port can be checked against the JS.

## Open questions

- Does Ollama run decision models on the Pi at all, outside MLX? (Phil testing.)
- Pi 5 8 GB or 16 GB? Phil's write-up didn't try 16 GB.
- AI add-ons: the Raspberry Pi AI HAT+ (Hailo) for vision, and whatever is current for language models. Check specs and Ollama / MediaPipe support before planning on one.
- D (NTK itself on the Pi): `packageElectron.js` already makes serial-free builds for other platforms; Linux arm64 hasn't been tried. Chromium on a Pi with MediaPipe WASM could be slow.
- Conflict with the [socket.io removal](socketio-removal.md) decision: dropping remote access (Role B) means NTK can't be a headless server on a Pi with the UI in a browser elsewhere, the 2014 Pi design. C and D don't need it, so this is noted, not a reason to revisit.

## Related threads

- [Standalone patch export](standalone-patch-export.md): the interpreter that would run on the Pi.
- Step 6 of the [build order](README.md#proposed-build-order) (possibly dropping serial and Firmata): any new device protocol should work for a Pi device too.
- [Decide widget](decision-widget.md): spike results on the Mac, Pi results to come.
- [LLM widget](llm-widget.md): provider settings, and a possible tool-calling mode.
