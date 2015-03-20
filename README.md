NTK
=============

NETLab Toolkit JavaScript Version

NTK (the NETLab Toolkit) is an authoring system for designers, developers, makers, researchers and students who want to design and build tangible Internet of Things projects. With a simple drag and drop interface, connect sensors, actuators, media and networks with the smart widgets. Concepts can be prototyped quickly, encouraging iteration, experimentation and testing by sketching in hardware.

NTK works with the original Arduino and newer Linux embedded systems like the Intel Galileo and Arduino Tre. And NTK can be easily adapted to do new things. The Code widget allows users to add custom Javascript. And with a bit more expertise, users can create their own, reusable widgets.

Go ahead, Drag and Drop the Internet of Things.

Installation instructions below. For more information and documentation, please see the project website.

<http://netlabtoolkit.org/>

Sign up for NTK news here:

<http://netlabtoolkit.org/join/>

Alpha Version - February 21st, 2015
---------------------
This is our first official release, and we look forward to your comments and bug reports as you try it out. This release includes 13 widgets and works on a computer. We're close to releasing a version that runs on the Intel Galileo and similar embedded Linux systems. Other widgets and improvements are in the near term pipeline, and will be released as they are ready.

We're planning the next major release as a Beta in June, 2015. This will include a complete set of widgets with a new visual design, as well as double click standard application versions of NTK.

For more information on this release, see this post: 

<http://www.netlabtoolkit.org/ntk-alpha-version-released/>

Installation
---------------------

### Node, NPM (one time only)

You must first install node and npm if you have not done so. Our recommendation is the following procedure ([from here](https://gist.github.com/isaacs/579814)), which has the least number of permissions issues. If you are on a Mac, you need to install the Xcode command line tools by installing Xcode (free from the app store).

```
echo 'export PATH=$HOME/local/bin:$PATH' >> ~/.bashrc
. ~/.bashrc
mkdir ~/local
mkdir ~/node-latest-install
cd ~/node-latest-install
curl http://nodejs.org/dist/node-latest.tar.gz | tar xz --strip-components=1
./configure --prefix=~/local
make install # this step will take a while...
curl https://www.npmjs.org/install.sh | sh
```

More details on [Node/NPM here](http://www.joyent.com/blog/installing-node-and-npm).

If you are on Raspberry Pi, then you probably have an outdated version of Node. Here's a nice & easy upgrade method: https://github.com/DonaldDerek/rPi-cheat-sheet

### Dependencies (one time only)

You will also need to install command-line tools: Ruby, bower, SASS, and the require.js build tool if you do not have them already:
```
npm install -g bower
npm install -g requirejs

sudo gem update --system
sudo gem install sass
```
### Current version of NTK

To install this version of NETLab Toolkit:
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
To run NTK as a **standard application**:

```
npm start
```
Note: if you've made any changes or this is the first time you are running it, you should rerun npm run build before npm start.

To run NTK as a **live-reload development server**, run grunt by:
```
npm run dev
```

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
