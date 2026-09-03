#!/bin/bash

echo -e $'\e[32m''Optimizing require.js modules'
echo -e $'\e[0m'
# Optimize our require.js application and output to our distribution directory
./node_modules/.bin/r.js -o build.js

echo -e $'\e[32m''require.js modules optimized'
echo -e $'\e[0m'

