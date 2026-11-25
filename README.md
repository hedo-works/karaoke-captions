# Karaoke Captions (web) v1.1

Creates karaoke-style captions for Premiere from the VO audio. It transcribes inside the browser (Whisper), fixes the transcript with the brief's script, breaks lines so they never go past the safe margins, and exports an SRT where the word being spoken is a different color. In Premiere they come in as regular captions (or text graphics), so nothing depends on plugins or on a specific Premiere version.

The interface is in English by default; switch to Spanish with the language menu at the top right (the choice is remembered).

Works in up-to-date Chrome or Edge on Windows, Mac and Linux. Safari and Firefox may work, but transcription is slower.

---

## 1. Using it

1. **Audio:** drag in the VO. WAV, MP3, M4A, MP4 and MOV all work. If the VO is spread across the sequence, export just the sequence audio (File > Export > Media, WAV or MP3) and drag that file in. **The audio must start at the same point as the sequence** so the timing lines up.
2. **Script (optional):** paste the brief's script, including the opener if the VO says it. It fixes brand names and words the transcription got wrong ("Guardia" becomes "Guardio") and lists anything the talent said differently from the script.
3. **Margins and text:** enter the same values as the Premiere style you'll use: font, weight, size and stroke. **Safe width**: for the 4x5 overlay on a 1080-wide frame it's 782 px (centered on the frame). The app measures every line with that font and breaks lines so none goes past it. The font must be installed on the computer.
4. **Highlight:** color of the active word and mode (current word only, or cumulative).
5. **Generate captions.** The first time, it downloads the transcription model (about 150 MB for "Fast", about 500 MB for "More accurate"). The browser keeps it for next time.
6. **Review:** edit the text of any line. ✂ splits the line at the cursor, ⤓ merges it with the next one, ✕ deletes it. Click the time to hear it. The preview shows the result; under "Preview style" you can load a frame from the video as the background and the safe zone overlay PNG.
7. **Export:** **Karaoke SRT** for Premiere. **Plain SRT** if the client asks for it. **Save project** keeps everything so you can fix it later (Open project).

## 2. In Premiere

1. **Import** the karaoke SRT and drag it into the sequence, starting at 00:00.
2. Apply the house style to the caption track (Essential Graphics > Track Style). The style sets the font, size, stroke, background box, shadow and position. The active word color comes from the SRT and is kept.
3. Optional: **Upgrade to caption graphics** to get them as editable text graphics.

**House styles:** build each style once in Premiere, then in the Project panel right-click > **Export Text Styles...** and save the `.prtextstyle` to a shared folder (for example `Drive > Caption Styles`). In each new project, import it like any other file.

**Small fixes:** each word is its own caption. To shift when a word lights up, move the edit point between two captions. For bigger changes, fix it in the app (Open project) and export again.

## 3. For whoever maintains it (optional)

- The code lives in `js/app.js` (interface, transcription, export), `js/core.js` (script matching and line breaks) and `js/i18n.js` (interface text in English and Spanish; add a language by copying one of the blocks). There is no server or database.
- The transcription library is pinned to an exact version (`@huggingface/transformers@3.8.1`), so outside updates don't change it.
- **Own copy of the model (recommended if the company adopts it):** download the files of `onnx-community/whisper-base_timestamped` (and `whisper-small_timestamped` if used) from huggingface.co and upload them to the site under `models/onnx-community/whisper-base_timestamped/`, keeping the same folder structure. The app uses that copy first, so it no longer depends on Hugging Face. GitHub limits files to 100 MB; if any file is larger, use Git LFS or another static host.
- To move it to the company's domain, copy the folder to any static host (or fork the repository).
