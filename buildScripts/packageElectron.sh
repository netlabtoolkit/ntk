#!/bin/sh
rm -r ./packaged
mkdir ./packaged

# electron lives in the root devDependencies, not server/'s — electron-packager
# can't auto-detect it from the ./server source dir, so read it explicitly.
ELECTRON_VERSION=$(node -p "require('./package.json').devDependencies.electron.replace(/^[^0-9]*/, '')")
APP_VERSION=$(node -p "require('./package.json').version")

# ALL
#./node_modules/.bin/electron-packager ./server NTK --platform=all --arch=arm64 --electron-version=$ELECTRON_VERSION --overwrite --out=packaged --app-version=$APP_VERSION

# OSX (Apple Silicon)
./node_modules/.bin/electron-packager ./server NTK --platform=darwin --arch=arm64 --electron-version=$ELECTRON_VERSION --overwrite --out=packaged --icon=server/icons/icon.icns --app-version=$APP_VERSION
#./node_modules/.bin/electron-packager ./server NTK --platform=linux --arch=arm64 --electron-version=$ELECTRON_VERSION --overwrite --out=packaged --icon=server/icons/icon.icns --app-version=$APP_VERSION

# WIN
#./node_modules/.bin/electron-packager ./server NTK --platform=win32 --arch=x64 --electron-version=$ELECTRON_VERSION --overwrite --out=packaged --icon=server/icons/icon.ico --app-version=$APP_VERSION
