#!/bin/bash

npm install -g bower
npm install -g requirejs

sudo gem update --system
sudo gem install sass

bower install
npm install
cd ./server
npm install
cd ..
npm run build
