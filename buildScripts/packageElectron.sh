#!/bin/sh
mkdir ./packaged

# ALL
#./node_modules/.bin/electron-packager ./server NTK --platform=all --arch=x64 --version=0.35.1 --overwrite --out=packaged

# OSX
./node_modules/.bin/electron-packager ./server NTK --platform=darwin --arch=x64 --version=0.35.1 --overwrite --out=packaged --icon=server/icons/icon.icns --app-version=1.0.0
#./node_modules/.bin/electron-packager ./server NTK --platform=linux --arch=x64 --version=1.3.3 --overwrite --out=packaged --icon=server/icons/icon.icns --app-version=1.0.0

# WIN
#./node_modules/.bin/electron-packager ./server NTK --platform=win32 --arch=x64 --version=0.35.1 --overwrite --out=packaged --icon=server/icons/icon.ico
