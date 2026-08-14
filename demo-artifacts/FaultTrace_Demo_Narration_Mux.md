# Add your narration to the silent walkthrough

Silent video (~4:00):

- `C:\Users\micha\Downloads\FaultTrace_Demo_Walkthrough_Silent.webm`
- `C:\Users\micha\FaultTrace\demo-artifacts\FaultTrace_Demo_Walkthrough_Silent.webm`

Teleprompter (read while you record voice, or while watching the silent file):

- `demo-artifacts\FaultTrace_Demo_Teleprompter.html`

## Option A — record voice over the silent file

1. Play the silent `.webm` and record mic (Clipchamp / Audacity / OBS).
2. Mux:

```powershell
$ff = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\ffmpeg.exe"
& $ff -y -i "$env:USERPROFILE\Downloads\FaultTrace_Demo_Walkthrough_Silent.webm" -i "$env:USERPROFILE\Downloads\FaultTrace_narration.m4a" -c:v copy -c:a aac -shortest "$env:USERPROFILE\Downloads\FaultTrace_Demo_Final.mp4"
```

## Option B — live record (webcam/mic + browser)

1. Open teleprompter on monitor 2, app on monitor 1.
2. Start OBS / Xbox Game Bar / Clipchamp.
3. Follow SAY/DO lines; the silent file is your backup B-roll if a take fails.

## Re-record silent B-roll

```powershell
# API + Vite already running
cd C:\Users\micha\FaultTrace\frontend
node scripts\record-demo-walkthrough.mjs
```
