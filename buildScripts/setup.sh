#!/bin/bash

npm install
cd ./server
npm install
cd ..

npm run rebuild

./node_modules/.bin/bower install

./buildScripts/fetchMediaPipeAssets.sh

npm run build
