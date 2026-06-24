Drop the two engine binaries into THIS folder before running the app:

  1. yt-dlp.exe   →  https://github.com/yt-dlp/yt-dlp/releases  (download "yt-dlp.exe")
  2. ffmpeg.exe   →  https://www.gyan.dev/ffmpeg/builds/  ("release essentials" zip)
                     extract bin\ffmpeg.exe and put it here

Final layout:
  video-extractor\bin\yt-dlp.exe
  video-extractor\bin\ffmpeg.exe

The app checks for both on startup and shows a warning until they are present.
Tip: re-download yt-dlp.exe every few weeks — sites change and it updates often.
