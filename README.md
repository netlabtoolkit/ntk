widgets-html5
=============

NETLab Toolkit JavaScript version

DISCLAIMER: This is an active development branch and is quite far from being "ready for primetime"

You must first install node and npm if you have not done so.

http://www.joyent.com/blog/installing-node-and-npm 

https://gist.github.com/isaacs/579814

If you are on Raspberry Pi, then you probably have an outdated version of Node. Here's a nice & easy upgrade method: https://github.com/DonaldDerek/rPi-cheat-sheet

You will also need to install bower and grunt if you do not have them already:
```
npm install bower
npm install grunt
```

To install this version of NETLab Toolkit:
```
git clone https://github.com/netlabtoolkit/widgets-html5.git
cd widgets-html5
bower install
npm install
```
To run a live-reload development server after installation run grunt in that directory:
```
grunt
```
or to run it as a standard application, run:
```
node server/app.js
```
