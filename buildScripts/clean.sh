#!/bin/bash

# Clean out the destination directory.
#
# This repo lives inside Dropbox, and Dropbox's Finder-sync extension
# tends to re-visit a just-recreated folder and write a fresh .DS_Store
# into it almost immediately - which can race with a plain `rm -r` and
# leave it failing with "Directory not empty" right after. Delete any
# .DS_Store first (belt) and use `rm -rf` (suspenders) so a stray one
# doesn't block the whole build.
find ./server/dist -name '.DS_Store' -delete 2>/dev/null
rm -rf ./server/dist
mkdir -p ./server/dist
