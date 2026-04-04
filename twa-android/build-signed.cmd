@echo off
setlocal
set BUBBLEWRAP_KEYSTORE_PASSWORD=ww138001
set BUBBLEWRAP_KEY_PASSWORD=ww138001
npm exec --yes @bubblewrap/cli -- build --manifest=twa-manifest.json
