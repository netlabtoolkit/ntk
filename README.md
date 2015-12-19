NTK
=============

NETLab Toolkit JavaScript Version

NTK (the NETLab Toolkit) is a visual authoring system for designers, developers, makers, researchers and students who want to design and build tangible Internet of Things projects. With a simple drag and drop interface, connect sensors, actuators, media and networks with the smart widgets. Concepts can be prototyped quickly, encouraging iteration, experimentation and testing by sketching in hardware.

NTK works with the original Arduino and newer Linux embedded systems like the Intel Edison. And NTK can be easily adapted to do new things. The Code widget allows users to add custom Javascript. And with a bit more expertise, users can create their own, reusable widgets.

Go ahead, Drag and Drop the Internet of Things.

Installation instructions below. For more information and documentation, please see the project website.

<http://netlabtoolkit.org/>

Sign up for NTK news here:

<http://netlabtoolkit.org/join/>

Installation
---------------------

If you only want to run NTK, there are double-clickable app and command line versions, and there is a simple installation procedure:

<http://netlabtoolkit.org/download/>  
<http://www.netlabtoolkit.org/install-ntk/>


For development purposes, use the below installation process:
---------------------

### Node, NPM (one time only)

You must first install node and npm if you have not already done so.

* Mac or Windows - Install Node and NPM from the official [Node.js website](http://nodejs.org/), using their standard installer (we've tested up to v4.2.2)
* Linux – You most likely have Node/NPM already installed but can also install via your distribution's [https://nodejs.org/en/download/package-manager/](package manager).

If you are on a Mac, you may need to install the Xcode command line tools by installing Xcode (free from the Mac app store).

If you are on Raspberry Pi, then you probably have an outdated version of Node. Here's a nice & easy upgrade method: https://github.com/DonaldDerek/rPi-cheat-sheet

### Dependencies (one time only)

You will also need to install command-line tools: Ruby, bower, SASS, and the require.js build tool if you do not have them already:
```
npm install -g bower
npm install -g requirejs

sudo gem update --system
sudo gem install sass
```
NOTE: On Mac OS X El Capitan v10.11, there's an issue with installing gems. For the above use:
```
sudo gem update --system -n /usr/local/bin
sudo gem install -n /usr/local/bin sass
```
Ref: <https://github.com/sass/sass/issues/1768>
### Current Build System for NTK

To install the build system and source for this version of NETLab Toolkit:
```
git clone https://github.com/netlabtoolkit/ntk.git
cd ntk
bower install
npm install
npm run build
```
Note: if you are running Linux, you will have to set proper permissions on your Arduino in order to use it.
For instance:
```
# Linux users only
sudo chmod a+rw /dev/ttyUSB0
```

Starting the server
---------------------
To run NTK as a **standard command-line application**:

```
npm start
```
Note: if you've made any changes or this is the first time you are running it, you should rerun "npm run build" before "npm start".

To run NTK as a **live-reload development server**, run grunt by:
```
npm run dev
```

To Build a Distributable Application
---------------------
After installing bower, SASS, requirejs build tool, etc. as noted above, run these commands to build:
```
npm run package
```

This will place the distributable builds in a folder named "packaged" in the main NTK directory.


Creating a New Widget
---------------------
Copy the Blank Widget folder located in the /app/scripts/views directory and name this new folder with the name of your widget. This folder has three files needed for each widget

*   **MyWidget.js** - the javascript view for the widget - must be named with widget name
*   **template.js** - the HTML template for the widget - keep this name
*   **styles.scss** - the css in SASS format - keep this name

Rename the view file to your widget name (e.g. from Blank.js to MyWidget.js).

Open the view file to see comments on building out a custom view in Javascript. In this file, be sure to change names of the **typeID**, **className** and **title** to your new widget name (paying close attention to capitalization).

Adding Your Custom Widget to WidgetMap.js
------------------------
When you are ready to test and run your widget you will need to add it into the system by opening the WidgetMap.js file located in the same directory (/app/scripts/views). There are three changes that need to be made to this file.

1) Look at the top of the file in the define section:
```
define([
	'views/Blank/Blank',
	'views/AnalogIn/AnalogIn',
	'views/AnalogOut/AnalogOut',
	'views/Code/Code',
	'views/Image/Image',
],
```
and add your widget like so:
```
define([
	'views/Blank/Blank',
	'views/AnalogIn/AnalogIn',
	'views/AnalogOut/AnalogOut',
	'views/Code/Code',
	'views/Image/Image',
	'views/MyWidget/MyWidget',
],
```
Note that the ".js" at the end of the file is unnecessary.

2) Then pass the widget into the function call as a parameter (order is very important. Always add to the end):
```
function(Blank, AnalogIn, AnalogOut, Code, Image){

...

function(Blank, AnalogIn, AnalogOut, Code, Image, MyWidget){
```

3) Add your widget to the map like so:
```
	return {
		'Blank': Blank,
		'AnalogIn': AnalogIn,
		'AnalogOut': AnalogOut,
		'Code': Code,
		'Image': Image,
	};

...

	return {
		'Blank': Blank,
		'AnalogIn': AnalogIn,
		'AnalogOut': AnalogOut,
		'Code': Code,
		'Image': Image,
		'The typeID of My Custom Widget View': MyWidget,
	};
```

This will both add the widget to the lefthand toolbar and allow your widget to be loaded from the GUI.

That's it!
