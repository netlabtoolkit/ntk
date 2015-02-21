NTK
=============

NETLab Toolkit JavaScript version

DISCLAIMER: This is an active development branch and is quite far from being "ready for primetime"

Installation
---------------------
You must first install node and npm if you have not done so. If you are on a Mac, you need to install the Xcode command line tools by installing Xcode (free from the app store) before you do the following.

https://gist.github.com/isaacs/579814 (we recommend the first example: node-and-npm-in-30-seconds.sh)

For more details

http://www.joyent.com/blog/installing-node-and-npm

If you are on Raspberry Pi, then you probably have an outdated version of Node. Here's a nice & easy upgrade method: https://github.com/DonaldDerek/rPi-cheat-sheet

You will also need to install command-line tools: Ruby, bower, SASS, and the require.js build tool if you do not have them already:
```
npm install -g bower
npm install -g requirejs

sudo gem update —system
sudo gem install sass
```

To install this version of NETLab Toolkit:
```
git clone https://github.com/netlabtoolkit/ntk.git
cd ntk
bower install
npm install
```

Starting the server
---------------------
To run a live-reload development server after installation run grunt in that directory:
```
npm run dev
```

or to run it as a standard application...

To build the production version (you will need to do this at least once if you haven't at some point):
```
npm run build
```

To start the server:
```
npm start
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
