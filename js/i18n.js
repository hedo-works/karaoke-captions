// ============================================================
// Interface text in English (default) and Spanish.
// Static text uses data-i18n / data-i18n-ph / data-i18n-title in index.html.
// ============================================================
(function () {
  var STR = {
    en: {
      tagline: "Karaoke captions for Premiere · everything runs on your computer",
      openProject: "Open project", saveProject: "Save project",
      s1: "1. Audio", dropTitle: "Drop the VO or the video",
      dropHint: "WAV, MP3, M4A, MP4 or MOV. You can also export the sequence audio.",
      voLang: "VO language", langEn: "English", langEs: "Spanish",
      transcription: "Transcription", modelFast: "Fast (base)", modelAcc: "More accurate (small)",
      s2: "2. Script", optional: "optional",
      scriptPh: "Paste the brief's script, including the opener if the VO says it. It fixes misheard words (brands, names).",
      s3: "3. Margins and text",
      s3hint: "Use the same values as the Premiere style you'll apply. The app breaks lines so none goes past the safe width.",
      frame: "Frame (width × height)", safeW: "Safe width (px)", font: "Font", weight: "Weight",
      size: "Size (px)", stroke: "Stroke (px)", maxChars: "Max characters", posY: "Vertical position (px)",
      seeFonts: "Show my installed fonts",
      s4: "4. Highlight", hlColor: "Active word color", mode: "Mode",
      modeCurrent: "Current word only", modeProg: "Cumulative (spoken words stay highlighted)",
      fixBase: "Set base color", minWord: "Minimum time per word (ms)",
      s4hint: "If you don't set a base color, the Premiere style sets the normal color.",
      generate: "Generate captions",
      preview: "Preview", previewNote: "approximate to the Premiere style", previewStyle: "Preview style",
      pvFill: "Base color", pvStroke: "Stroke color", pvBox: "Background box", pvBoxOp: "Box opacity %",
      pvShadow: "Shadow", pvBg: "Test background", loadImage: "Load image", pvOverlay: "Safe zone overlay",
      loadPng: "Load PNG", pvGuides: "Show safe width",
      captions: "Captions",
      capsHint: "Edit the text directly. Click the time to hear it. If you change the number of words, that line's timing is redistributed automatically.",
      diffsTitle: "Differences from the script", diffsHint: "They show up here if you paste the script.",
      s5: "5. Export", expKaraoke: "Karaoke SRT (for Premiere)", expPlain: "Plain SRT",
      expHint: "In Premiere: import the SRT, drag it into the sequence, apply the style (.prtextstyle) to the track and, if you want, Upgrade to caption graphics.",
      // dynamic
      start: "Load an audio file to start.", ready: "Ready to generate.",
      noFontApi: "This browser can't list fonts. Type the exact font name (as it appears in Premiere).",
      fontsAvailable: "{n} fonts available. Start typing in the Font field.",
      fontsError: "Couldn't read the fonts: {m}",
      downloading: "Downloading the model (first time only): {a} / {b} MB",
      loadingModel: "Loading the transcription model ({d})...",
      modelFail: "Couldn't load the model: {m}",
      transcribing: "Transcribing {i} of {n}...",
      retryCpu: "Retrying without GPU acceleration...",
      fontMissing: 'Heads up: the font "{f}" is not installed on this computer; line breaks use a similar font.',
      preparing: "Preparing the audio...",
      emptyTranscript: "The transcript came out empty. Does the file have audible speech?",
      done: "Done: {n} lines.", checkDiffs: " Check the differences from the script.",
      listen: "Listen", over: "This line goes past the safe width",
      split: "Split at the cursor", merge: "Merge with the next line", del: "Delete",
      fixed: "Fixed with the script", changed: "Said differently from the script",
      notSaid: "(not said)", notInScript: "(not in the script)", noDiffs: "No differences.",
      notProject: "That file isn't a Karaoke Captions project.",
      projectOpened: "Project opened. Load the audio too if you want to hear it in the preview."
    },
    es: {
      tagline: "Subtítulos karaoke para Premiere · todo se procesa en tu equipo",
      openProject: "Abrir proyecto", saveProject: "Guardar proyecto",
      s1: "1. Audio", dropTitle: "Arrastra el VO o el video",
      dropHint: "WAV, MP3, M4A, MP4 o MOV. También puedes exportar el audio de la secuencia.",
      voLang: "Idioma del VO", langEn: "Inglés", langEs: "Español",
      transcription: "Transcripción", modelFast: "Rápida (base)", modelAcc: "Más precisa (small)",
      s2: "2. Script", optional: "opcional",
      scriptPh: "Pega el script del brief, incluido el opener si el VO lo dice. Sirve para corregir palabras mal transcritas (marcas, nombres).",
      s3: "3. Márgenes y texto",
      s3hint: "Usa los mismos valores del estilo de Premiere que vas a aplicar. La app corta las líneas para que ninguna pase el ancho seguro.",
      frame: "Frame (ancho × alto)", safeW: "Ancho seguro (px)", font: "Fuente", weight: "Peso",
      size: "Tamaño (px)", stroke: "Stroke (px)", maxChars: "Máx. caracteres", posY: "Posición vertical (px)",
      seeFonts: "Ver mis fuentes instaladas",
      s4: "4. Resaltado", hlColor: "Color de la palabra activa", mode: "Modo",
      modeCurrent: "Solo la palabra actual", modeProg: "Acumulado (las dichas quedan resaltadas)",
      fixBase: "Fijar color base", minWord: "Duración mínima por palabra (ms)",
      s4hint: "Si no fijas el color base, el color normal lo pone el estilo de Premiere.",
      generate: "Generar subtítulos",
      preview: "Vista previa", previewNote: "aproximada al estilo de Premiere", previewStyle: "Estilo de la vista previa",
      pvFill: "Color base", pvStroke: "Color stroke", pvBox: "Recuadro", pvBoxOp: "Opacidad recuadro %",
      pvShadow: "Sombra", pvBg: "Fondo de prueba", loadImage: "Cargar imagen", pvOverlay: "Overlay de zona segura",
      loadPng: "Cargar PNG", pvGuides: "Mostrar ancho seguro",
      captions: "Subtítulos",
      capsHint: "Edita el texto directamente. Clic en el tiempo para escucharlo. Si cambias la cantidad de palabras, los tiempos de esa línea se reparten solos.",
      diffsTitle: "Diferencias con el script", diffsHint: "Aparecen aquí si pegas el script.",
      s5: "5. Exportar", expKaraoke: "SRT karaoke (para Premiere)", expPlain: "SRT normal",
      expHint: "En Premiere: importa el SRT, arrástralo a la secuencia, aplica el estilo (.prtextstyle) a la pista y, si quieres, Upgrade to caption graphics.",
      start: "Carga un audio para empezar.", ready: "Listo para generar.",
      noFontApi: "Este navegador no permite listar fuentes. Escribe el nombre exacto de la fuente (como aparece en Premiere).",
      fontsAvailable: "{n} fuentes disponibles. Empieza a escribir en el campo Fuente.",
      fontsError: "No se pudieron leer las fuentes: {m}",
      downloading: "Descargando el modelo (solo la primera vez): {a} / {b} MB",
      loadingModel: "Cargando el modelo de transcripción ({d})...",
      modelFail: "No se pudo cargar el modelo: {m}",
      transcribing: "Transcribiendo {i} de {n}...",
      retryCpu: "Reintentando sin aceleración de GPU...",
      fontMissing: 'Aviso: la fuente "{f}" no está instalada en este equipo; los cortes se calculan con una fuente parecida.',
      preparing: "Preparando el audio...",
      emptyTranscript: "La transcripción salió vacía. ¿El archivo tiene voz audible?",
      done: "Listo: {n} líneas.", checkDiffs: " Revisa las diferencias con el script.",
      listen: "Escuchar", over: "Esta línea se pasa del ancho seguro",
      split: "Partir en la posición del cursor", merge: "Unir con la siguiente", del: "Borrar",
      fixed: "Corregido con el script", changed: "Dice distinto al script",
      notSaid: "(no lo dice)", notInScript: "(no está en el script)", noDiffs: "Sin diferencias.",
      notProject: "Ese archivo no es un proyecto de Karaoke Captions.",
      projectOpened: "Proyecto abierto. Carga también el audio si quieres escucharlo en la vista previa."
    }
  };
  var lang = "en";
  try { var saved = localStorage.getItem("kc.uiLang"); if (saved === "es" || saved === "en") lang = saved; } catch (e) { }
  function t(key, vars) {
    var s = (STR[lang] && STR[lang][key]) || STR.en[key] || key;
    if (vars) for (var k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  function apply() {
    document.documentElement.lang = lang;
    var els = document.querySelectorAll("[data-i18n]"), i;
    for (i = 0; i < els.length; i++) els[i].textContent = t(els[i].getAttribute("data-i18n"));
    els = document.querySelectorAll("[data-i18n-ph]");
    for (i = 0; i < els.length; i++) els[i].placeholder = t(els[i].getAttribute("data-i18n-ph"));
    els = document.querySelectorAll("[data-i18n-title]");
    for (i = 0; i < els.length; i++) els[i].title = t(els[i].getAttribute("data-i18n-title"));
  }
  function setLang(l) {
    lang = l === "es" ? "es" : "en";
    try { localStorage.setItem("kc.uiLang", lang); } catch (e) { }
    apply();
    document.dispatchEvent(new Event("kc-lang"));
  }
  window.I18N = { t: t, apply: apply, setLang: setLang, get lang() { return lang; } };
})();
