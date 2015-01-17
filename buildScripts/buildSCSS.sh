#!/bin/bash

# Make sure that the for loop separates on line breaks from "find" rather than spaces (default)
SAVEIFS=$IFS
IFS=$(echo -en "\n\b")

# Build main SCSS files first which include @imports for the other scss files
sass ./app/styles/main.scss ./server/dist/styles/main.css

# This scripts finds all SCSS files in a directory and compiles them to CSS, then concatenates them to the main.css file in the dist directory
fileName=""
for scssFile in $(find ./app/scripts -name '*.scss' ! -path '*bower_components*') ; do
	fileName=${scssFile##*/}
	sass ${scssFile} >> ./server/dist/styles/main.css
done

echo -e $'\e[32m''SCSS files built'
echo -e $'\e[0m' # reset color formatting

