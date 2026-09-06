NTK
=============

NETLab Toolkit JavaScript Version

NTK (the NETLab Toolkit) is a visual authoring system for designers, developers, makers, researchers and students who want to design and build tangible Internet of Things projects. With a simple drag and drop interface, connect sensors, actuators, media and networks with the smart widgets. Concepts can be prototyped quickly, encouraging iteration, experimentation and testing by sketching in hardware.

NTK works with the original Arduino over USB, and also with WiFi-connected microcontrollers - see `firmware/` for a CircuitPython Firmata firmware for the Seeed XIAO ESP32-C6, supporting AnalogIn/Out, DigitalIn/Out, Servo, and Grove sensors. And NTK can be easily adapted to do new things. The Code widget allows users to add custom Javascript. And with a bit more expertise, users can create their own, reusable widgets.

Go ahead, Drag and Drop the Internet of Things.

This branch has been modernized to build and run natively on Apple Silicon Macs, updating the Electron and dependency toolchain accordingly. Other platforms (Intel Mac, Windows, Linux) are not currently built or tested - see "To Build a Distributable Application" below.

Installation instructions below. For more information and documentation, please see the project website.

<http://netlabtoolkit.org/>

Sign up for NTK news here:

<http://netlabtoolkit.org/join/>

Installation
---------------------

If you only want to run NTK, download the latest pre-built, signed and notarized macOS (Apple Silicon) app from the GitHub releases page:

<https://github.com/netlabtoolkit/ntk/releases/latest>

Each release's `NTK-darwin-arm64.zip` contains `NTK.app` plus the `CircuitPython/` firmware folder for flashing a matching Seeed XIAO ESP32-C6 board.

Older double-clickable app and command line versions, and the original installation procedure, are on the project website:

<http://netlabtoolkit.org/download/>  
<http://www.netlabtoolkit.org/install-ntk/>


For development purposes, use the below installation process:
---------------------

### Node, NPM (one time only)

You must first install node and npm if you have not already done so.

* Mac or Windows - Install Node and NPM from the official [Node.js website](http://nodejs.org/), using their standard installer. We recommend a current Node.js LTS release (this branch has been built and tested with Node v24).
* Linux – You most likely have Node/NPM already installed but can also install via your distribution's [https://nodejs.org/en/download/package-manager/](package manager).
* If you are on Raspberry Pi, then you probably have an outdated version of Node. Here's a nice & easy upgrade method: https://github.com/DonaldDerek/rPi-cheat-sheet

If you are on a Mac, you may need to install the Xcode command line tools by installing Xcode (free from the Mac app store).

### Current Build System for NTK (one time only)

To install the build system, dependencies, and source for this version of NTK:
```
git clone https://github.com/netlabtoolkit/ntk.git
cd ntk
npm run setup
```

Note: if you are running Linux, you will have to set proper permissions on your Arduino in order to use it.
For instance:
```
# Linux users only
sudo chmod a+rw /dev/ttyUSB0
```

Starting the server
---------------------
To run NTK as the **Electron desktop app**:

```
npm run electron
```
Note: if you've made any changes or this is the first time you are running it, you should rerun "npm run build" before "npm run electron".

To run NTK as a **standard command-line web server** (no Electron window, connect with any browser):

```
npm start
```

To run NTK as a **live-reload development server**, run:
```
npm run dev
```

To Build a Distributable Application
---------------------
After running `npm run setup` as noted above, build the packaged app with:
```
npm run package
```

This will place the distributable builds in a folder named "packaged" in the main NTK directory.

Note: this currently builds for Apple Silicon (arm64) Macs only - other platforms are not yet supported by the build script.

Note: the packaged app bundles its own snapshot of the code (`app.asar`), separate from the `server/dist` folder used by `npm run electron`/`npm run dev`. Running `npm run build` on its own will *not* update an already-built package - rerun `npm run package` (or `npm run package:dev` for a faster unsigned build, skipping signing/notarization) any time you want a packaged build to reflect source changes.


Creating a New Widget
---------------------
See this page for details: <http://www.netlabtoolkit.org/documentation/create-your-own-widget/>
