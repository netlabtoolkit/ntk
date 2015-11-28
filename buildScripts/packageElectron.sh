#!/bin/sh
mkdir ./packaged

# LINUX
./node_modules/.bin/electron-packager ./server NTK --platform=linux --arch=x64 --version=0.35.1 --overwrite --out=packaged

# OSX
./node_modules/.bin/electron-packager ./server NTK --platform=darwin --arch=x64 --version=0.35.1 --overwrite --out=packaged
