/**
 * course/assets/js/dashboard.js
 * Porsche WBT AI Creator Suite — Frontend Controller
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // DOM Elements
  const dropZone = document.getElementById('material-drop-zone');
  const fileUploader = document.getElementById('file-uploader');
  const materialsList = document.getElementById('materials-list');
  const materialCount = document.getElementById('material-count');
  
  const storyboardEditor = document.getElementById('storyboard-editor');
  const btnSaveStoryboard = document.getElementById('btn-save-storyboard');
  const btnResetStoryboard = document.getElementById('btn-reset-storyboard');
  const unsavedIndicator = document.getElementById('unsaved-indicator');
  const btnCopyPrompt = document.getElementById('btn-copy-prompt');
  const btnAiGenerate = document.getElementById('btn-ai-generate');

  const btnAll = document.getElementById('btn-pipeline-all');
  const btnCompile = document.getElementById('btn-pipeline-compile');
  const btnImagePrompts = document.getElementById('btn-pipeline-image-prompts');
  const btnVo = document.getElementById('btn-pipeline-vo');
  const btnVtt = document.getElementById('btn-pipeline-vtt');
  const btnCues = document.getElementById('btn-pipeline-cues');
  const btnPackage = document.getElementById('btn-pipeline-package');
  const btnScormTest = document.getElementById('btn-scorm-test');
  const btnUpdateSlide = document.getElementById('btn-update-slide');
  const btnUpdateSlideVoice = document.getElementById('btn-update-slide-voice');
  
  const consoleStream = document.getElementById('console-stream');
  const btnClearConsole = document.getElementById('btn-clear-console');

  const previewDrawer = document.getElementById('preview-drawer'); // now the always-on center stage
  const btnClosePreview = document.getElementById('btn-close-preview'); // hidden; kept for image-adjust cancel hook
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnMaterialsToggle = document.getElementById('btn-materials-toggle');
  const btnMaterialsClose = document.getElementById('btn-materials-close');
  const materialsDrawer = document.getElementById('materials-drawer');
  const materialsScrim = document.getElementById('materials-scrim');
  const tabButtons = document.querySelectorAll('.tab[data-tab]');
  const tabPanels = document.querySelectorAll('.tabpanel[data-tab]');
  const slideSelector = document.getElementById('preview-slide-selector');
  const previewIframe = document.getElementById('preview-iframe');
  const btnPreviewEdit = document.getElementById('btn-preview-edit');
  const btnSetImage = document.getElementById('btn-set-image');
  const slideImageUploader = document.getElementById('slide-image-uploader');
  const slideImageDropzone = document.getElementById('slide-image-dropzone');
  const dropzoneSlideId = document.getElementById('dropzone-slide-id');
  const btnPreviewPlayPause = null;
  const previewTimer = document.getElementById('preview-timer');
  const btnPreviewMode = document.getElementById('btn-preview-mode');
  const btnSlidePrev = null;
  const btnSlideNext = null;
  const chkAutoCompile = document.getElementById('chk-auto-compile');
  const audioScrubber = document.getElementById('audio-scrubber');
  const scrubberFill = document.getElementById('scrubber-fill');
  const scrubberHandle = document.getElementById('scrubber-handle');

  const viewerOverlay = document.getElementById('viewer-overlay');
  const viewerFilename = document.getElementById('viewer-filename');
  const viewerContent = document.getElementById('viewer-content');
  const btnCloseViewer = document.getElementById('btn-close-viewer');

  const statusBadge = document.getElementById('status-badge');
  const btnStopServer = document.getElementById('btn-stop-server');
  const toastContainer = document.getElementById('toast-container');

  let originalStoryboardContent = '';
  let activeSlideIds = [];

  // =========================================================================
  // 1. Storyboard Studio Integration
  // =========================================================================

  async function loadStoryboard() {
    try {
      const res = await fetch('/api/storyboard');
      const data = await res.json();
      storyboardEditor.value = data.content;
      originalStoryboardContent = data.content;
      unsavedIndicator.classList.remove('active');
    } catch (err) {
      appendConsole(`[ERROR] Failed to load storyboard/course.md: ${err.message}\n`);
    }
  }

  storyboardEditor.addEventListener('input', () => {
    if (storyboardEditor.value !== originalStoryboardContent) {
      unsavedIndicator.classList.add('active');
    } else {
      unsavedIndicator.classList.remove('active');
    }
  });

  // ── External-change guard ─────────────────────────────────────────────────
  // The editor holds an in-memory copy of course.md loaded at startup. The file
  // can also change on disk — a recompile, an edit made outside the dashboard,
  // or another tool. A blind save would silently clobber those changes, so every
  // write path runs prepareEditorBase() first to reconcile editor vs. disk.
  async function fetchDiskStoryboard() {
    const res = await fetch('/api/storyboard');
    if (!res.ok) throw new Error(`read failed (${res.status})`);
    return (await res.json()).content;
  }

  // Reconcile the editor with the on-disk file before writing.
  //   • disk unchanged                 → proceed (return true)
  //   • disk changed, editor clean      → silently adopt disk, then proceed
  //   • disk changed, editor has edits  → ask: overwrite disk, or abort & reload
  // Returns true if the caller may write, false if it should abort.
  async function prepareEditorBase() {
    let disk;
    try { disk = await fetchDiskStoryboard(); }
    catch (_) { return true; } // can't verify → don't block the user
    if (disk === originalStoryboardContent) return true;
    const dirty = storyboardEditor.value !== originalStoryboardContent;
    if (!dirty) {
      storyboardEditor.value = disk;
      originalStoryboardContent = disk;
      unsavedIndicator.classList.remove('active');
      appendConsole('>>> Storyboard reloaded — course.md changed on disk.\n');
      return true; // base is now the fresh disk content
    }
    const overwrite = window.confirm(
      'course.md changed on disk since you opened it.\n\n' +
      'OK = keep YOUR editor changes and overwrite the disk version\n' +
      'Cancel = abort (reload the disk version from the storyboard panel first)'
    );
    if (!overwrite) {
      appendConsole('[STORYBOARD] Save aborted — disk version kept. Reload before editing.\n');
    }
    return overwrite;
  }

  // When returning to the dashboard, silently adopt any external change to
  // course.md — but only when the editor has no unsaved edits, so we never
  // discard the author's in-progress work.
  function reloadStoryboardIfClean() {
    if (storyboardEditor.value !== originalStoryboardContent) return;
    fetchDiskStoryboard().then(disk => {
      if (disk !== originalStoryboardContent) {
        storyboardEditor.value = disk;
        originalStoryboardContent = disk;
        unsavedIndicator.classList.remove('active');
        appendConsole('>>> Storyboard auto-reloaded — course.md changed on disk.\n');
      }
    }).catch(() => {});
  }
  window.addEventListener('focus', reloadStoryboardIfClean);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadStoryboardIfClean(); });

  async function saveStoryboard() {
    if (!(await prepareEditorBase())) return;
    try {
      const content = storyboardEditor.value;
      const res = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      if (data.success) {
        originalStoryboardContent = content;
        unsavedIndicator.classList.remove('active');
        appendConsole('>>> Storyboard successfully saved to storyboard/course.md\n');
        
        // Auto-compile if enabled. Reload the preview afterward so baked-in
        // changes (e.g. learning-objectives VO cue times) are actually shown.
        if (chkAutoCompile && chkAutoCompile.checked) {
          const activeSlideId = slideSelector.value;
          if (activeSlideId) {
            appendConsole(`>>> Auto-Compile triggered (Single Slide: ${activeSlideId})...\n`);
            triggerPipeline('/api/compile-single', btnCompile, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slideId: activeSlideId })
            }).then(() => { if (slideSelector.value === activeSlideId) updateIframeSrc(activeSlideId); });
          } else {
            appendConsole('>>> Auto-Compile triggered (Full Course Rebuild)...\n');
            triggerPipeline('/api/compile', btnCompile)
              .then(() => { if (slideSelector.value) updateIframeSrc(slideSelector.value); });
          }
        }
      } else {
        appendConsole(`[ERROR] Save failed: ${data.error}\n`);
      }
    } catch (err) {
      appendConsole(`[ERROR] Save error: ${err.message}\n`);
    }
  }

  btnSaveStoryboard.addEventListener('click', saveStoryboard);

  btnResetStoryboard.addEventListener('click', () => {
    storyboardEditor.value = originalStoryboardContent;
    unsavedIndicator.classList.remove('active');
    appendConsole('>>> Storyboard reverted to saved version on disk.\n');
  });

  // =========================================================================
  // 2. Drag & Drop Material Sandbox
  // =========================================================================

  // Ingested Files list loader
  async function loadMaterials() {
    try {
      const res = await fetch('/api/materials');
      const data = await res.json();
      renderMaterials(data.files || []);
    } catch (err) {
      appendConsole(`[ERROR] Failed to load materials list: ${err.message}\n`);
    }
  }

  // Dropzone events
  dropZone.addEventListener('click', () => fileUploader.click());
  fileUploader.addEventListener('change', () => {
    handleFileUploads(fileUploader.files);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    handleFileUploads(dt.files);
  });

  // Upload file stream
  async function handleFileUploads(files) {
    if (!files.length) return;
    appendConsole(`>>> Ingesting ${files.length} training material assets...\n`);

    for (const file of files) {
      try {
        appendConsole(`Uploading: ${file.name} (${formatBytes(file.size)})...\n`);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Name': file.name
          },
          body: file
        });
        const data = await res.json();
        if (data.success) {
          appendConsole(`[INGEST SUCCESS] ${file.name} saved to materials catalog.\n`);
        } else {
          appendConsole(`[INGEST ERROR] ${file.name} failed: ${data.error}\n`);
        }
      } catch (err) {
        appendConsole(`[INGEST ERROR] ${file.name} upload exception: ${err.message}\n`);
      }
    }
    loadMaterials();
  }

  // Render materials cards
  function renderMaterials(files) {
    materialCount.textContent = files.length;            // compact toolbar pill
    materialCount.title = `${files.length} asset${files.length === 1 ? '' : 's'}`;
    if (!files.length) {
      materialsList.innerHTML = `<div class="inventory-empty-state">No source files dropped yet. Drop training materials to begin slide mapping.</div>`;
      return;
    }

    materialsList.innerHTML = files.map(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      let icon = 'pi-document';
      if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) icon = 'pi-image';
      else if (['xlsx', 'xls'].includes(ext)) icon = 'pi-file-excel';
      else if (ext === 'csv') icon = 'pi-file-csv';
      // pdf, pptx/ppt, docx/doc, md/txt all fall back to the generic document icon

      return `
        <div class="material-card" data-filename="${escapeHtml(file.name)}">
          <div class="material-meta">
            <i class="pi ${icon} material-icon"></i>
            <div class="material-details">
              <span class="material-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
              <span class="material-size">${formatBytes(file.size)}</span>
            </div>
          </div>
          <div class="material-actions">
            <button class="material-view-trigger" onclick="viewFile('${escapeHtml(file.name)}')">View</button>
            <button class="material-delete-trigger" title="Delete from materials" onclick="deleteFile('${escapeHtml(file.name)}')">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Delete an uploaded material (destructive — confirm first).
  window.deleteFile = async function(filename) {
    if (!confirm(`Delete "${filename}" from materials? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/delete-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (data.success) {
        appendConsole(`>>> Deleted ${filename} from materials catalog.\n`);
        showToast(`Deleted ${filename}`, 'success');
        loadMaterials();
      } else {
        appendConsole(`[ERROR] Delete failed: ${data.error}\n`);
        showToast('Delete failed', 'error');
      }
    } catch (err) {
      appendConsole(`[ERROR] Delete error: ${err.message}\n`);
      showToast('Delete failed', 'error');
    }
  };

  // File Preview viewer
  window.viewFile = async function(filename) {
    try {
      const ext = filename.split('.').pop().toLowerCase();
      viewerFilename.textContent = filename;
      viewerContent.innerHTML = '<div style="color:var(--pds-brand-gold);">Loading file preview...</div>';
      viewerOverlay.hidden = false;

      // In real server static serving, read the uploaded material
      const res = await fetch(`/assets/materials/${encodeURIComponent(filename)}`);
      
      if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
        viewerContent.innerHTML = `<div style="text-align:center;"><img src="/assets/materials/${encodeURIComponent(filename)}" style="max-width:100%; max-height:450px; border-radius:8px; box-shadow:var(--pds-shadow-glow);"></div>`;
      } else if (ext === 'csv') {
        const csvText = await res.text();
        viewerContent.innerHTML = renderCsvTable(csvText);
      } else if (['md', 'txt', 'html'].includes(ext)) {
        const text = await res.text();
        viewerContent.innerHTML = `<pre style="white-space:pre-wrap; font-family:monospace; background-color:#121316; padding:16px; border-radius:8px; border:1px solid var(--pds-border); color:#D1D2D5;">${escapeHtml(text)}</pre>`;
      } else {
        viewerContent.innerHTML = `
          <div style="text-align:center; padding:32px 0;">
            <i class="pi pi-document" style="font-size:3rem; margin-bottom:16px;"></i>
            <p><strong>${escapeHtml(filename)}</strong></p>
            <p style="font-size:12px; color:var(--pds-text-muted); margin-top:8px;">This file type (${ext.toUpperCase()}) is stored in your active course resources catalog.</p>
            <a href="/assets/materials/${encodeURIComponent(filename)}" download class="btn btn-primary" style="display:inline-block; margin-top:16px; text-decoration:none;">Download File</a>
          </div>
        `;
      }
    } catch (err) {
      viewerContent.innerHTML = `<div style="color:var(--pds-error);">Failed to open file: ${err.message}</div>`;
    }
  };

  btnCloseViewer.addEventListener('click', () => {
    viewerOverlay.hidden = true;
  });

  // Parse CSV into rows of fields, honoring quoted fields that may contain
  // commas, newlines, and escaped ("") quotes — RFC 4180 style.
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++; // swallow CRLF pair
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    // Flush trailing field/row if the file didn't end with a newline.
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    // Drop fully-empty trailing rows.
    return rows.filter(r => r.length && !(r.length === 1 && r[0] === ''));
  }

  // Render CSV as high-fidelity table
  function renderCsvTable(csvText) {
    const rows = parseCsv(csvText);
    if (!rows.length) return 'Empty CSV file.';

    let html = '<table class="csv-table">';
    html += '<thead><tr>' + rows[0].map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead>';
    html += '<tbody>';
    for (let i = 1; i < rows.length; i++) {
      html += '<tr>' + rows[i].map(c => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  // =========================================================================
  // 3. Script Execution & Streaming
  // =========================================================================

  async function triggerPipeline(endpoint, buttonElement, options = null) {
    buttonElement.disabled = true;
    buttonElement.style.opacity = '0.5';
    setBusy(true, 'Running…');
    // Keep prior output; just separate runs so failures stay comparable.
    if (consoleStream.textContent.trim()) {
      appendConsole(`\n${'─'.repeat(48)}\n`);
    }
    appendConsole(`>>> Executing compilation script...\n`);

    try {
      const fetchOpts = options || { method: 'POST' };
      const res = await fetch(endpoint, fetchOpts);
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        appendConsole(chunk);
      }
      
      // Refresh slide selectors in case slide lists changed
      if (endpoint.includes('compile')) {
        loadSlideSelectors();
      }
    } catch (err) {
      appendConsole(`[PIPELINE EXCEPTION] Stream read failed: ${err.message}\n`);
    } finally {
      buttonElement.disabled = false;
      buttonElement.style.opacity = '1';
      setBusy(false);
    }
  }

  if (btnAll) btnAll.addEventListener('click', () => triggerPipeline('/api/generate-all', btnAll));
  btnCompile.addEventListener('click', () => triggerPipeline('/api/compile', btnCompile));
  if (btnImagePrompts) btnImagePrompts.addEventListener('click', () => triggerPipeline('/api/generate-image-prompts', btnImagePrompts));
  btnVo.addEventListener('click', () => triggerPipeline('/api/generate-vo', btnVo));
  if (btnVtt) btnVtt.addEventListener('click', () => triggerPipeline('/api/generate-vtt', btnVtt));
  if (btnCues) btnCues.addEventListener('click', () => triggerPipeline('/api/extract-vo-cues', btnCues));
  btnPackage.addEventListener('click', () => triggerPipeline('/api/package', btnPackage));
  if (btnScormTest) btnScormTest.addEventListener('click', () => window.open('/scorm-test', 'scorm-harness'));

  // Single-slide updates — scoped to the slide selected in the preview drawer.
  function updateSelectedSlide(withVoice, buttonEl) {
    const slideId = slideSelector.value;
    if (!slideId) {
      appendConsole('[UPDATE] Select a slide in the preview first.\n');
      showToast('Select a slide to update first.', 'error');
      return;
    }
    appendConsole(`>>> Updating ${slideId}${withVoice ? ' (with voice regeneration)' : ' (layout only)'}...\n`);
    triggerPipeline('/api/update-slide', buttonEl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slideId, withVoice })
    }).then(() => {
      // Reload the iframe so the freshly compiled slide is shown.
      if (slideSelector.value === slideId) updateIframeSrc(slideId);
    });
  }

  if (btnUpdateSlide) btnUpdateSlide.addEventListener('click', () => updateSelectedSlide(false, btnUpdateSlide));
  if (btnUpdateSlideVoice) btnUpdateSlideVoice.addEventListener('click', () => updateSelectedSlide(true, btnUpdateSlideVoice));

  btnClearConsole.addEventListener('click', () => {
    consoleStream.textContent = 'Console cleared. Ready for compilation pipeline triggers...';
  });

  // Stop the local dashboard server. The server acknowledges, then exits — so the
  // fetch resolves (or the connection drops) and the UI flips to a stopped state.
  if (btnStopServer) {
    btnStopServer.addEventListener('click', async () => {
      if (!confirm('Stop the dashboard server? The dashboard will stop working until you restart it with:\n\n    node scripts/dashboard-server.js')) return;
      appendConsole('\n>>> Stopping dashboard server...\n');
      try {
        await fetch('/api/shutdown', { method: 'POST' });
      } catch (_) {
        // Connection drops as the process exits — expected, not an error.
      }
      setBusy(false);
      statusBadge.classList.remove('online', 'busy');
      statusBadge.classList.add('offline');
      statusBadge.textContent = 'Server Stopped';
      appendConsole('>>> Server stopped. Restart it from your terminal:\n    node scripts/dashboard-server.js\n');
      showToast('Server stopped. Restart: node scripts/dashboard-server.js', 'info', 8000);
    });
  }

  function appendConsole(text) {
    consoleStream.textContent += text;
    consoleStream.scrollTop = consoleStream.scrollHeight;
  }

  // =========================================================================
  // 4. Slide Preview & Dropdown list
  // =========================================================================

  async function loadSlideSelectors() {
    try {
      const res = await fetch('/data/course.data.json');
      const data = await res.json();
      if (data.slides) {
        activeSlideIds = data.slides.map(s => s.id);
        slideSelector.innerHTML = '<option value="">Select compiled slide...</option>' + 
          activeSlideIds.map(id => `<option value="${id}">${id}</option>`).join('');
      }
    } catch (_) {
      // JSON might not exist yet before first compilation
      slideSelector.innerHTML = '<option value="">No slides compiled yet.</option>';
    }
  }

  // =========================================================================
  // 4. Slide Preview & Player Mock Shim
  // =========================================================================

  let previewMode = 'player'; // 'slide' or 'player'

  // Slide Mode is an editing/preview mode, not playback: the intro voiceover is
  // loaded (so the scrubber and Space-bar still work) but never autoplays on
  // select. Player Mode runs the real runtime.js and is unaffected by this flag.
  const autoplayPreviewAudio = false;

  // Lightweight mock CourseRuntime so slides can run standalone with audio / interactive sync
  window.CourseRuntime = {
    // Flags the embedding context as the authoring dashboard (not the real
    // player), so interactive slides can unlock gated UI (e.g. tab-panel tabs)
    // immediately for previewing instead of waiting for the intro VO to end.
    isDashboardPreview: true,
    activeAudio: null,
    activeInteractionAudio: null,

    getAudioCurrentTime: function() {
      return window.CourseRuntime.activeAudio ? window.CourseRuntime.activeAudio.currentTime : 0;
    },

    getAudioDuration: function() {
      return window.CourseRuntime.activeAudio ? window.CourseRuntime.activeAudio.duration : 0;
    },

    isAudioPlaying: function() {
      return window.CourseRuntime.activeAudio ? !window.CourseRuntime.activeAudio.paused : false;
    },

    playInteractionAudio: function(payload) {
      if (window.CourseRuntime.activeInteractionAudio) {
        window.CourseRuntime.activeInteractionAudio.pause();
      }
      let src = payload.src;
      if (src.startsWith('../')) {
        src = src.substring(3); // make relative to dashboard.html
      }
      window.CourseRuntime.activeInteractionAudio = new Audio(src);
      window.CourseRuntime.activeInteractionAudio.play().catch(e => {
        console.log("[PREVIEW] Autoplay interaction audio blocked:", e);
      });
    }
  };

  function formatTime(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '0.00s';
    return `${seconds.toFixed(2)}s`;
  }

  function updateIframeSrc(slideId) {
    if (!slideId) {
      previewIframe.src = 'about:blank';
      stopSlideIntroAudio();
      if (btnUpdateSlide) btnUpdateSlide.disabled = true;
      if (btnUpdateSlideVoice) btnUpdateSlideVoice.disabled = true;
      if (btnSetImage) btnSetImage.disabled = true;
      return;
    }

    btnPreviewMode.disabled = false;
    btnPreviewEdit.disabled = false;
    if (btnUpdateSlide) btnUpdateSlide.disabled = false;
    if (btnUpdateSlideVoice) btnUpdateSlideVoice.disabled = false;
    // Image assets exist only for content slides — quiz/score slides have none.
    if (btnSetImage) btnSetImage.disabled = !slideSupportsImage(slideId);
    
    if (previewMode === 'slide') {
      previewDrawer.classList.remove('player-active');
      previewIframe.src = `slides/${slideId}.html`;
      playSlideIntroAudio(slideId);
    } else {
      previewDrawer.classList.add('player-active');
      stopSlideIntroAudio();
      previewTimer.textContent = 'Managed by Player';
      if (btnPreviewPlayPause) {
        btnPreviewPlayPause.disabled = true;
        btnPreviewPlayPause.textContent = '⏸️';
      }
      previewIframe.src = `index.html?slide=${slideId}&dev=1`;
    }
  }

  function playSlideIntroAudio(slideId) {
    stopSlideIntroAudio();
    
    if (slideId && !slideId.startsWith('3FQ') && !slideId.endsWith('_SCORE')) {
      let audioPath = `assets/audio/vo/${slideId}-INTRO.mp3`;
      
      const aud = new Audio(audioPath);
      window.CourseRuntime.activeAudio = aud;
      
      if (btnPreviewPlayPause) {
        btnPreviewPlayPause.disabled = false;
        btnPreviewPlayPause.textContent = '⏸️';
      }
      btnPreviewEdit.disabled = false;

      aud.addEventListener('timeupdate', () => {
        if (window.CourseRuntime.activeAudio === aud) {
          previewTimer.textContent = `${formatTime(aud.currentTime)} / ${formatTime(aud.duration)}`;
          updateScrubber(aud.currentTime, aud.duration);
        }
      });

      aud.addEventListener('ended', () => {
        if (window.CourseRuntime.activeAudio === aud) {
          if (btnPreviewPlayPause) btnPreviewPlayPause.textContent = '▶️';
        }
      });

      if (btnPreviewPlayPause) btnPreviewPlayPause.textContent = '▶️';

      // Slide Mode never autoplays — the learner-facing player (runtime.js) owns
      // playback. The audio is loaded above; press Space to play it for review.
      if (autoplayPreviewAudio) {
        // Brief timeout to ensure the iframe content initializes before playing
        setTimeout(() => {
          if (window.CourseRuntime.activeAudio === aud) {
            aud.play().catch(e => {
              console.log("[PREVIEW] Autoplay intro audio blocked, click the preview window first:", e);
            });
          }
        }, 350);
      }
    } else {
      btnPreviewEdit.disabled = !slideId;
    }
  }

  function stopSlideIntroAudio() {
    if (window.CourseRuntime.activeAudio) {
      window.CourseRuntime.activeAudio.pause();
      window.CourseRuntime.activeAudio = null;
    }
    if (window.CourseRuntime.activeInteractionAudio) {
      window.CourseRuntime.activeInteractionAudio.pause();
      window.CourseRuntime.activeInteractionAudio = null;
    }
    if (btnPreviewPlayPause) {
      btnPreviewPlayPause.disabled = true;
      btnPreviewPlayPause.textContent = '⏸️';
    }
    previewTimer.textContent = '0.00s / 0.00s';
    btnPreviewEdit.disabled = true;
    updateScrubber(0, 0);
  }

  // Interactive controls — toggle the active slide-intro audio (no dedicated
  // button in the DOM anymore; driven by the Space shortcut below).
  function togglePlayPause() {
    const aud = window.CourseRuntime.activeAudio;
    if (!aud) return;
    if (aud.paused) {
      aud.play().catch(e => console.log(e));
      if (btnPreviewPlayPause) btnPreviewPlayPause.textContent = '⏸️';
      previewIframe.contentWindow?.postMessage({ type: 'player-play-state', state: 'playing' }, '*');
    } else {
      aud.pause();
      if (btnPreviewPlayPause) btnPreviewPlayPause.textContent = '▶️';
      previewIframe.contentWindow?.postMessage({ type: 'player-play-state', state: 'paused' }, '*');
    }
  }

  if (btnPreviewPlayPause) {
    btnPreviewPlayPause.addEventListener('click', togglePlayPause);
  }

  // =========================================================================
  // 4b. Slide Image Assignment — paste / drop / pick → WebP → save → recompile
  // =========================================================================

  // Final-quiz (3FQ*) and score slides have no image slot in their template.
  // Knowledge-Check (2KC*) slides DO render an image, so they accept pasted art.
  function slideSupportsImage(slideId) {
    return !!slideId && !slideId.startsWith('3FQ') && !slideId.endsWith('_SCORE');
  }

  // Lightweight, self-contained toast (no toast system existed before this).
  function toast(message, type = 'info', ms = 4000) {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  // Slide stage is 1920×920 (pds-tokens.css); cap the long edge and re-encode as
  // WebP in the browser so the server stays a zero-dependency byte-writer.
  const SLIDE_IMG_MAX_DIM = 1920;
  const SLIDE_IMG_WEBP_QUALITY = 0.82; // ~200–400KB full-bleed, visually lossless

  async function fileToWebpBlob(file) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, SLIDE_IMG_MAX_DIM / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', SLIDE_IMG_WEBP_QUALITY));
      if (!blob) throw new Error('WebP conversion failed (canvas.toBlob returned null)');
      return blob;
    } finally {
      if (bitmap.close) bitmap.close();
    }
  }

  // ── Per-card targeting (card-explore) ─────────────────────────────────────
  // In Slide Mode the preview iframe is same-origin, so clicking a card selects
  // it as the image target. card-explore cards expose data-card and use the
  // Card-Image-<Label> storyboard field. (tab-panel uses one shared slide-level
  // image — the big stage — so its tabs are NOT image targets; they open modals.)
  let selectedCard = null; // { label, field } or null for the slide-level image

  function previewDoc() {
    try { return previewIframe.contentDocument || null; } catch (_) { return null; }
  }
  function cardFromEl(el) {
    const label = el.getAttribute('data-card');
    if (!label) return null;
    return {
      el, label,
      field:      `Card-Image-${label}`,
      posField:   `Card-Image-Position-${label}`,
      scaleField: `Card-Image-Scale-${label}`,
    };
  }
  function getPreviewCards() {
    const doc = previewDoc();
    if (!doc) return [];
    return Array.from(doc.querySelectorAll('[data-card]')).map(cardFromEl).filter(Boolean);
  }
  function refreshSetImageLabel() {
    const lbl = btnSetImage && btnSetImage.querySelector('.btn-label');
    if (lbl) lbl.textContent = selectedCard ? `Set Image → ${selectedCard.label}` : 'Set Image';
  }
  function clearCardSelection() {
    selectedCard = null;
    const doc = previewDoc();
    if (doc) doc.querySelectorAll('.wbt-img-target').forEach(el => el.classList.remove('wbt-img-target'));
    refreshSetImageLabel();
  }
  function selectCardEl(el) {
    const card = cardFromEl(el);
    if (!card) return;
    const doc = previewDoc();
    if (doc) doc.querySelectorAll('.wbt-img-target').forEach(n => n.classList.remove('wbt-img-target'));
    el.classList.add('wbt-img-target');
    selectedCard = { label: card.label, field: card.field, posField: card.posField, scaleField: card.scaleField };
    refreshSetImageLabel();
  }

  // Wire click-to-select (and drop-on-card) into the preview document. Only in
  // Slide Mode, and once per loaded document. Card clicks select instead of
  // triggering the slide's own explore behavior (capture-phase + stopPropagation).
  function wireCardTargeting() {
    if (previewMode !== 'slide') return;
    const doc = previewDoc();
    if (!doc || !doc.head || doc.getElementById('wbt-img-target-style')) return;
    const hasTargets = !!doc.querySelector('[data-card]');
    const st = doc.createElement('style');
    st.id = 'wbt-img-target-style';
    st.textContent =
      '[data-card]{cursor:pointer;}' +
      '[data-card]:hover{outline:2px dashed rgba(213,0,28,.7);outline-offset:-2px;}' +
      '.wbt-img-target{outline:3px solid #D5001C !important;outline-offset:-3px;}';
    doc.head.appendChild(st);

    // Slide-level-image templates (content-bullets, hero, closing, learning-
    // objectives, tab-panel, …) have no card to click. Paste needs the event to
    // land on a document with our handler — but the user's focus is often in the
    // parent editor (textareas are ignored on purpose). Clicking the preview
    // focuses the iframe so the next ⌘V fires here, and hints that paste/drop/pick
    // target the slide image. Drop & "Set Image" already work for the slide image.
    if (!hasTargets) {
      doc.addEventListener('click', () => {
        try { (doc.defaultView || window).focus(); } catch (_) {}
        toast('Slide image ready — paste (⌘V), drop, or pick an image.', 'info', 2200);
      });
      return;
    }

    doc.addEventListener('click', (e) => {
      const el = e.target.closest('[data-card]');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      selectCardEl(el);
      const c = cardFromEl(el);
      toast(`Card “${c.label}” selected — paste, drop, or pick an image.`, 'info', 2600);
    }, true);
    doc.addEventListener('dragover', (e) => { if (e.target.closest('[data-card]')) e.preventDefault(); }, true);
    doc.addEventListener('drop', (e) => {
      const el = e.target.closest('[data-card]');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      selectCardEl(el);
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) assignImage(file);
    }, true);
  }

  let imageSaveInFlight = false;

  // Core: convert a File/Blob to WebP and assign it to the current target — the
  // selected card (Card-Image/Item-Image field) or, with no card selected, the
  // slide-level image (Image-File).
  async function assignImage(file, overwrite = false) {
    if (imageSaveInFlight) return;
    const slideId = slideSelector.value;
    if (!slideId) { toast('Select a slide first, then paste or drop an image.', 'error'); return; }
    if (!slideSupportsImage(slideId)) { toast(`${slideId} is a quiz/score slide — it has no image asset.`, 'error'); return; }

    // card-explore cards each own their own image — require the author to pick
    // which card the image goes to.
    const cards = getPreviewCards();
    if (!selectedCard && cards.length) {
      toast('Click a card in the preview to choose where the image goes.', 'error');
      return;
    }
    if (!file || !file.type || !file.type.startsWith('image/')) {
      toast('That isn’t a valid image. Use PNG, JPG, or WebP.', 'error');
      return;
    }
    const accepted = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!accepted.includes(file.type)) {
      toast(`Unsupported image type: ${file.type}. Use PNG, JPG, or WebP.`, 'error');
      return;
    }

    const target = selectedCard; // capture (a reload could clear it later)
    const dispName = target ? `${slideId}-${target.label}.webp` : `${slideId}.webp`;
    const where = target ? `${slideId} · ${target.label}` : slideId;
    const headers = () => {
      const h = { 'Content-Type': 'image/webp', 'X-Slide-Id': slideId };
      if (target) { h['X-Card-Label'] = target.label; h['X-Image-Field'] = target.field; }
      return h;
    };

    imageSaveInFlight = true;
    if (btnSetImage) btnSetImage.disabled = true;
    try {
      appendConsole(`>>> Converting image for ${where} to WebP...\n`);
      const webp = await fileToWebpBlob(file);

      let res = await fetch(`/api/save-slide-image${overwrite ? '?overwrite=1' : ''}`, {
        method: 'POST', headers: headers(), body: webp,
      });
      if (res.status === 409) {
        const info = await res.json().catch(() => ({}));
        const ok = window.confirm(`${info.existing || dispName} already exists.\n\nReplace it with the new image?`);
        if (!ok) { appendConsole(`>>> Image assignment for ${where} cancelled (kept existing asset).\n`); return; }
        res = await fetch('/api/save-slide-image?overwrite=1', { method: 'POST', headers: headers(), body: webp });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `Server returned ${res.status}`);

      appendConsole(`[IMAGE SUCCESS] Saved ${data.name} (${formatBytes(webp.size)}) → ${data.field}. Recompiling slide...\n`);
      if (data.removed && data.removed.length) {
        appendConsole(`>>> Removed orphaned asset(s): ${data.removed.join(', ')}\n`);
      }

      // course.md now points the field at the .webp; recompile so the slide HTML
      // references it, then reload the preview.
      const comp = await fetch('/api/compile-single', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideId }),
      });
      const compLog = await comp.text();
      if (compLog) appendConsole(compLog.endsWith('\n') ? compLog : compLog + '\n');

      // Refresh the editor (clean-only) so the new field line shows.
      reloadStoryboardIfClean();

      if (slideSelector.value === slideId) updateIframeSrc(slideId);
      toast(`Image saved & assigned to ${where} (${formatBytes(webp.size)})`, 'success');
    } catch (err) {
      appendConsole(`[IMAGE ERROR] ${where}: ${err.message}\n`);
      toast(`Could not assign image: ${err.message}`, 'error');
    } finally {
      imageSaveInFlight = false;
      if (btnSetImage) btnSetImage.disabled = !slideSupportsImage(slideSelector.value);
    }
  }

  // — Trigger 1: click "Set Image" → open the file picker (assigns to the
  //   selected card if one is selected, else the slide-level image) —
  if (btnSetImage && slideImageUploader) {
    btnSetImage.addEventListener('click', () => {
      if (!slideSupportsImage(slideSelector.value)) return;
      const cards = getPreviewCards();
      if (!selectedCard && cards.length) {
        toast('Click a card in the preview first, then Set Image.', 'info');
        return;
      }
      slideImageUploader.click();
    });
    slideImageUploader.addEventListener('change', () => {
      const file = slideImageUploader.files && slideImageUploader.files[0];
      if (file) assignImage(file);
      slideImageUploader.value = ''; // allow re-picking the same file
    });
  }

  // — Trigger 2: paste an image. Attached to BOTH the dashboard document and the
  //   preview iframe's document — after clicking a card, focus is inside the
  //   iframe, so ⌘V fires there, not on the parent. —
  function handleImagePaste(e) {
    const t = e.target;
    const tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || (t && t.isContentEditable)) return;
    const slideId = slideSelector.value;
    if (!slideId || !slideSupportsImage(slideId)) return;
    const items = e.clipboardData ? Array.from(e.clipboardData.items) : [];
    const imgItem = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!imgItem) {
      // Only complain if the user clearly intended an image paste context.
      if (items.length) toast('Clipboard has no image. Copy an image, then paste.', 'error');
      return;
    }
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (file) assignImage(file);
  }
  document.addEventListener('paste', handleImagePaste);

  // — Trigger 3: drag-and-drop onto the preview (assigns to the selected card,
  //   or the slide image). Dropping directly on a card is handled inside the
  //   iframe by wireCardTargeting(). —
  if (slideImageDropzone) {
    const iframeContainer = previewIframe ? previewIframe.parentElement : null;
    const showDrop = (show) => {
      const slideId = slideSelector.value;
      if (show && (!slideId || !slideSupportsImage(slideId))) return;
      slideImageDropzone.hidden = !show;
      if (show && dropzoneSlideId) {
        dropzoneSlideId.textContent = selectedCard ? `${slideId}-${selectedCard.label}.webp` : `${slideId}.webp`;
      }
    };
    if (iframeContainer) {
      ['dragenter', 'dragover'].forEach(ev =>
        iframeContainer.addEventListener(ev, (e) => {
          if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          showDrop(true);
        })
      );
    }
    ['dragleave', 'dragend'].forEach(ev =>
      slideImageDropzone.addEventListener(ev, (e) => {
        if (e.relatedTarget && slideImageDropzone.contains(e.relatedTarget)) return;
        showDrop(false);
      })
    );
    slideImageDropzone.addEventListener('dragover', (e) => e.preventDefault());
    slideImageDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      showDrop(false);
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) assignImage(file);
    });
  }

  // When a new slide loads in Slide Mode, reset any card selection and wire
  // click-to-select / drop-on-card AND paste into the fresh preview document
  // (clicking a card moves focus into the iframe, so ⌘V fires there).
  previewIframe.addEventListener('load', () => {
    selectedCard = null;
    refreshSetImageLabel();
    if (previewMode === 'slide') {
      const doc = previewDoc();
      if (doc) { try { doc.addEventListener('paste', handleImagePaste); } catch (_) {} }
    }
    // Card scripts run on load; defer so [data-card]/[data-tab] exist.
    setTimeout(wireCardTargeting, 60);
  });

  btnPreviewEdit.addEventListener('click', () => {
    const slideId = slideSelector.value;
    if (!slideId) return;
    
    const editorText = storyboardEditor.value;
    const searchStr = `Slide-ID: ${slideId}`;
    const index = editorText.indexOf(searchStr);
    
    if (index >= 0) {
      storyboardEditor.focus();
      storyboardEditor.setSelectionRange(index, index + searchStr.length);
      
      const linesBefore = editorText.substring(0, index).split('\n').length;
      const lineHeight = 18; // approximate line height in pixels
      storyboardEditor.scrollTop = (linesBefore - 5) * lineHeight;
      
      appendConsole(`>>> Focused Storyboard Editor on ${slideId} (Line ${linesBefore})\n`);
    } else {
      appendConsole(`[WARNING] Slide-ID ${slideId} not found in active storyboard editor.\n`);
    }
  });

  btnPreviewMode.addEventListener('click', () => {
    const slideId = slideSelector.value;
    if (!slideId) return;
    
    const modeIcon = btnPreviewMode.querySelector('.pi');
    const modeLabel = btnPreviewMode.querySelector('.btn-label');
    if (previewMode === 'slide') {
      previewMode = 'player';
      if (modeLabel) modeLabel.textContent = 'Slide Mode';
      if (modeIcon) { modeIcon.classList.remove('pi-screen'); modeIcon.classList.add('pi-document'); }
      btnPreviewMode.classList.add('btn-primary');
    } else {
      previewMode = 'slide';
      if (modeLabel) modeLabel.textContent = 'Player Mode';
      if (modeIcon) { modeIcon.classList.remove('pi-document'); modeIcon.classList.add('pi-screen'); }
      btnPreviewMode.classList.remove('btn-primary');
    }
    
    updateIframeSrc(slideId);
  });

  slideSelector.addEventListener('change', () => {
    const slideId = slideSelector.value;
    updateIframeSrc(slideId);
    updateNavButtons();
  });

  // Preview is permanent center stage now — no show/hide toggle. The hidden
  // #btn-close-preview is only a cancel hook for the image-adjust tool: stop
  // audio without tearing down the stage.
  if (btnClosePreview) {
    btnClosePreview.addEventListener('click', () => stopSlideIntroAudio());
  }

  // ── Right-panel tabs (Storyboard / Build) ──
  function activateTab(name) {
    tabButtons.forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    tabPanels.forEach(p => p.classList.toggle('active', p.dataset.tab === name));
  }
  tabButtons.forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));

  // ── Theme toggle (light / dark) — persisted ──
  const THEME_KEY = 'wbt-dashboard-theme';
  function applyTheme(theme) {
    const light = theme === 'light';
    document.documentElement.classList.toggle('pds-light', light);
    document.body.classList.toggle('pds-light', light);
    const ico = btnThemeToggle && btnThemeToggle.querySelector('.theme-icon');
    if (ico) { ico.classList.toggle('pi-sun', light); ico.classList.toggle('pi-moon', !light); }
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const next = document.body.classList.contains('pds-light') ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  // ── Materials slide-over drawer (left) ──
  function openMaterials() {
    materialsDrawer.hidden = false;
    materialsScrim.hidden = false;
    requestAnimationFrame(() => {
      materialsDrawer.classList.add('open');
      materialsScrim.classList.add('open');
    });
  }
  function closeMaterials() {
    materialsDrawer.classList.remove('open');
    materialsScrim.classList.remove('open');
    setTimeout(() => { materialsDrawer.hidden = true; materialsScrim.hidden = true; }, 250);
  }
  if (btnMaterialsToggle) btnMaterialsToggle.addEventListener('click', () => {
    materialsDrawer.hidden ? openMaterials() : closeMaterials();
  });
  if (btnMaterialsClose) btnMaterialsClose.addEventListener('click', closeMaterials);
  if (materialsScrim) materialsScrim.addEventListener('click', closeMaterials);

  // =========================================================================
  // 4b. Scrubber seek logic
  // =========================================================================

  function updateScrubber(currentTime, duration) {
    const pct = (duration > 0) ? (currentTime / duration) * 100 : 0;
    scrubberFill.style.width = `${pct}%`;
    scrubberHandle.style.left = `${pct}%`;
  }

  let isScrubbing = false;

  function seekToPosition(e) {
    const aud = window.CourseRuntime.activeAudio;
    if (!aud || !aud.duration) return;
    const rect = audioScrubber.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    aud.currentTime = pct * aud.duration;
    updateScrubber(aud.currentTime, aud.duration);
  }

  audioScrubber.addEventListener('mousedown', (e) => {
    isScrubbing = true;
    seekToPosition(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (isScrubbing) seekToPosition(e);
  });

  document.addEventListener('mouseup', () => {
    isScrubbing = false;
  });

  // =========================================================================
  // 4c. Slide Navigation (Prev/Next)
  // =========================================================================

  function updateNavButtons() {
    const currentIdx = activeSlideIds.indexOf(slideSelector.value);
    if (btnSlidePrev) btnSlidePrev.disabled = (currentIdx <= 0);
    if (btnSlideNext) btnSlideNext.disabled = (currentIdx < 0 || currentIdx >= activeSlideIds.length - 1);
  }

  function navigateSlide(direction) {
    const currentIdx = activeSlideIds.indexOf(slideSelector.value);
    const targetIdx = currentIdx + direction;
    if (targetIdx >= 0 && targetIdx < activeSlideIds.length) {
      slideSelector.value = activeSlideIds[targetIdx];
      updateIframeSrc(activeSlideIds[targetIdx]);
      updateNavButtons();
    }
  }

  if (btnSlidePrev) btnSlidePrev.addEventListener('click', () => navigateSlide(-1));
  if (btnSlideNext) btnSlideNext.addEventListener('click', () => navigateSlide(1));

  // =========================================================================
  // 4d. Keyboard Shortcuts
  // =========================================================================

  document.addEventListener('keydown', (e) => {
    // Don't capture when user is typing in textarea/input
    const tag = e.target.tagName.toLowerCase();
    const isEditing = (tag === 'textarea' || tag === 'input' || tag === 'select');

    // Cmd/Ctrl + S → Save storyboard (works even while editing)
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveStoryboard();
      return;
    }

    // Below shortcuts only work when not editing text
    if (isEditing) return;

    // Space → Play/Pause
    if (e.key === ' ' && !previewDrawer.hidden) {
      e.preventDefault();
      togglePlayPause();
    }

    // Arrow Left → Previous Slide
    if (e.key === 'ArrowLeft' && !previewDrawer.hidden) {
      e.preventDefault();
      navigateSlide(-1);
    }

    // Arrow Right → Next Slide
    if (e.key === 'ArrowRight' && !previewDrawer.hidden) {
      e.preventDefault();
      navigateSlide(1);
    }

    // Escape → close the materials drawer if it's open
    if (e.key === 'Escape' && materialsDrawer && !materialsDrawer.hidden) {
      closeMaterials();
    }
  });

  // =========================================================================
  // 5. Prompt Copier
  // =========================================================================
  const aiScopePrompt = document.getElementById('ai-scope-prompt');

  btnCopyPrompt.addEventListener('click', () => {
    let promptText = `You are the Porsche Technical WBT Storyboard Generator AI.
Your task is to analyze the attached technical training materials and generate a valid structured Markdown storyboard file named "course.md".

### Storyboard Rules:
1. Start strictly with these headers:
# Course: [Short Module Title]
# Player-Title: [Series] - Module [N] - [Full Title]

2. Each slide MUST start with a H2: "## Slide 01 — Slide Title"
3. Use Key: Value formatting, strictly one per line (buried key-value items fail the parser).
4. Do NOT include course codes or module numbers in image filenames (e.g. use "1S01.jpg", NOT "CC02_1S01.jpg").
5. Separators: Slide IDs have no separators (e.g. "1S01", "2KC01", "3FQ01"). Audio and VTT files strictly use hyphens (e.g. "1S01-INTRO.mp3").

### Interactive Lock Constraints:
All interactive elements start locked. Voiceover narration tracks are individual per interaction. Spoken "click Next to continue" prompts are prohibited.

### Final Quiz Rule:
Final quiz questions (slides "3FQ01" to "3FQ10") form a SILENT assessment. Do NOT output "Voiceover-INTRO" or "Caption-Text" fields for FQ slides.

### Template IDs to Choose From:
- hero-title: Cover.
- learning-objectives: Objectives list.
- card-explore: 3 to 6 subtopic cards.
- hotspot: Technical parts / visual callouts.
- accordion-content: Processes/chronologies.
- content-split: bullets and split layouts.
- knowledge-check: 4 mid-course questions.
- final-quiz: 10 scored pool questions.`;

    // Append custom focus scope if present
    const customScope = aiScopePrompt.value.trim();
    if (customScope) {
      promptText += `\n\n### SPECIAL MODULE SCOPE & TARGET INSTRUCTIONS:\n${customScope}`;
    }

    navigator.clipboard.writeText(promptText).then(() => {
      const prevText = btnCopyPrompt.textContent;
      btnCopyPrompt.textContent = 'Copied!';
      btnCopyPrompt.classList.add('btn-primary');
      setTimeout(() => {
        btnCopyPrompt.textContent = prevText;
        btnCopyPrompt.classList.remove('btn-primary');
      }, 1500);
    });
  });
  
  btnAiGenerate.addEventListener('click', async () => {
    const customScope = aiScopePrompt.value.trim();
    if (!customScope) {
      appendConsole('[ERROR] Please write your special module scope / target details before generating.\n');
      showToast('Enter your module scope before generating.', 'error');
      return;
    }

    const previousContent = storyboardEditor.value;
    btnAiGenerate.disabled = true;
    btnAiGenerate.querySelector('.btn-label').textContent = 'Queuing…';
    setBusy(true, 'Generating…');
    storyboardEditor.value = 'Analyzing learning materials and generating structured storyboard with AI Creator Suite. Please wait...';

    appendConsole('>>> Initiating Storyboard AI generation pipeline...\n');
    try {
      const res = await fetch('/api/generate-storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: customScope })
      });

      // The server holds the connection open and streams status, ending with a
      // sentinel once the AI agent rewrites course.md (or on timeout).
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      btnAiGenerate.querySelector('.btn-label').textContent = 'Working…';
      let ready = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        let chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('__STORYBOARD_READY__')) {
          ready = true;
          chunk = chunk.replace('__STORYBOARD_READY__', '');
        }
        if (chunk.includes('__STORYBOARD_TIMEOUT__')) {
          chunk = chunk.replace('__STORYBOARD_TIMEOUT__', '');
        }
        if (chunk) appendConsole(chunk);
      }

      if (ready) {
        await loadStoryboard(); // pulls the freshly written course.md into the editor
        appendConsole('>>> Success! New storyboard has been loaded into the editor.\n');
        showToast('Storyboard generated and loaded!', 'success');
      } else {
        storyboardEditor.value = previousContent;
        showToast('Generation timed out. Check the AI agent.', 'error');
      }
    } catch (err) {
      appendConsole(`[ERROR] AI exception: ${err.message}\n`);
      storyboardEditor.value = previousContent;
      showToast('Generation failed.', 'error');
    } finally {
      btnAiGenerate.disabled = false;
      btnAiGenerate.querySelector('.btn-label').textContent = 'Generate Storyboard';
      setBusy(false);
    }
  });

  // =========================================================================
  // Helper functions
  // =========================================================================

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Header pipeline-status pill: idle ("Pipeline Ready") vs. busy (amber, pulsing).
  function setBusy(busy, label) {
    if (!statusBadge) return;
    statusBadge.classList.toggle('busy', busy);
    statusBadge.classList.toggle('online', !busy);
    statusBadge.textContent = busy ? (label || 'Working…') : 'Pipeline Ready';
  }

  // Transient corner notification. type: 'info' | 'success' | 'error'.
  function showToast(message, type = 'info', duration = 3500) {
    if (!toastContainer) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // Bootstrapping
  loadStoryboard();
  loadMaterials();
  loadSlideSelectors().then(() => {
    // Preview is always-on center stage — show the first compiled slide on load.
    if (!slideSelector.value && activeSlideIds.length > 0) {
      slideSelector.value = activeSlideIds[0];
      updateIframeSrc(activeSlideIds[0]);
      updateNavButtons();
    }
  });

  // =========================================================================
  // 7. Resizable Panels
  // =========================================================================

  const dashboardGrid = document.getElementById('dashboard-grid');
  const colResize2 = document.getElementById('col-resize-2');
  const sidepanel = document.getElementById('sidepanel');

  // Transparent overlay to prevent the iframe from stealing the mouse during drag
  let dragOverlay = null;
  function createDragOverlay() {
    dragOverlay = document.createElement('div');
    dragOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:inherit;';
    document.body.appendChild(dragOverlay);
  }
  function removeDragOverlay() {
    if (dragOverlay) { dragOverlay.remove(); dragOverlay = null; }
  }

  // --- Resize the right side panel (preview takes the remaining space) ---
  (function initSidepanelResize() {
    if (!colResize2 || !sidepanel) return;
    let dragging = false, startX = 0, startWidth = 0;

    colResize2.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startWidth = sidepanel.getBoundingClientRect().width;
      colResize2.classList.add('dragging');
      createDragOverlay();
      dragOverlay.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      // Drag the handle left → wider side panel (so delta to the right shrinks it).
      const delta = e.clientX - startX;
      const gridWidth = dashboardGrid.getBoundingClientRect().width;
      const newW = Math.max(300, Math.min(startWidth - delta, gridWidth * 0.6));
      sidepanel.style.flex = `0 0 ${newW}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      colResize2.classList.remove('dragging');
      removeDragOverlay();
    });
  })();

  // =========================================================================
  // Shared storyboard field editors — used by the image-adjust and vignette
  // tools. Both edit course.md directly (never the compiled slide HTML).
  // =========================================================================
  // Upsert a "Field: value" line into the storyboard block whose Slide-ID matches.
  function upsertField(text, slideId, field, value) {
    const lines = text.split('\n');
    const esc = slideId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idRe = new RegExp('^\\s*Slide-ID:\\s*' + esc + '\\s*$', 'i');
    const idIdx = lines.findIndex(l => idRe.test(l));
    if (idIdx === -1) return text;
    let end = lines.length;
    for (let i = idIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) { end = i; break; }
    }
    const fieldRe = new RegExp('^\\s*' + field + ':', 'i');
    for (let i = idIdx; i < end; i++) {
      if (fieldRe.test(lines[i])) { lines[i] = `${field}: ${value}`; return lines.join('\n'); }
    }
    let insertAt = idIdx + 1;
    for (let i = idIdx; i < end; i++) {
      if (/^\s*Image-File:/i.test(lines[i])) insertAt = i + 1;
    }
    lines.splice(insertAt, 0, `${field}: ${value}`);
    return lines.join('\n');
  }
  // Delete a "Field: value" line from the storyboard block whose Slide-ID matches.
  function removeField(text, slideId, field) {
    const lines = text.split('\n');
    const esc = slideId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idRe = new RegExp('^\\s*Slide-ID:\\s*' + esc + '\\s*$', 'i');
    const idIdx = lines.findIndex(l => idRe.test(l));
    if (idIdx === -1) return text;
    let end = lines.length;
    for (let i = idIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) { end = i; break; }
    }
    const fieldRe = new RegExp('^\\s*' + field + ':', 'i');
    for (let i = idIdx; i < end; i++) {
      if (fieldRe.test(lines[i])) { lines.splice(i, 1); break; }
    }
    return lines.join('\n');
  }

  // Read the raw value of a "Field:" line for a slide (or null). Reads the live
  // storyboard editor text so tools can pre-fill from the current saved state.
  function readField(text, slideId, field) {
    const lines = text.split('\n');
    const esc = slideId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const idRe = new RegExp('^\\s*Slide-ID:\\s*' + esc + '\\s*$', 'i');
    const idIdx = lines.findIndex(l => idRe.test(l));
    if (idIdx === -1) return null;
    const fieldRe = new RegExp('^\\s*' + field + ':\\s*(.*)$', 'i');
    for (let i = idIdx + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break;
      const m = lines[i].match(fieldRe);
      if (m) return m[1].trim();
    }
    return null;
  }

  // =========================================================================
  // Visual image-adjust tool — pan/zoom a slide's image, save to storyboard.
  // Edits live in course.md (Image-Position / Image-Scale), never in the slide
  // HTML, so Compile can never overwrite the framing.
  // =========================================================================
  (function initImageAdjust() {
    const btnImgAdjust = document.getElementById('btn-img-adjust');
    if (!btnImgAdjust) return;
    // Swap the button's PDS icon + label between idle (adjust) and armed (save) states.
    const setAdjustBtn = (saving) => {
      const ico = btnImgAdjust.querySelector('.pi');
      const lbl = btnImgAdjust.querySelector('.btn-label');
      if (ico) { ico.classList.toggle('pi-save', saving); ico.classList.toggle('pi-adjust', !saving); }
      if (lbl) lbl.textContent = saving ? 'Save Framing' : 'Adjust Image';
    };

    let active = false;
    let imgEl = null;                  // the image element being adjusted in the iframe
    let adjustCard = null;             // the selected card being adjusted, or null for the slide image
    let posX = 50, posY = 50, scale = 1;
    let dragging = false, startX = 0, startY = 0, startPosX = 50, startPosY = 50, startVX = 50, startVY = 50;
    let overlay = null;                // capture layer over the iframe during adjust
    // Matte/haze (0–1) + color overlay (#hex + opacity) — slide-level image only.
    let matte = 0, overlayColor = null, overlayOpacity = 0.3;
    let matteTouched = false, overlayTouched = false;
    let toolbar = null, liveOverlayEl = null;
    // Vignette (folded into this tool): when mode != 'off', drag moves the region
    // center + scroll resizes it; otherwise drag pans / scroll zooms the image.
    let vig = { mode: 'off', x: 50, y: 50, size: 34, feather: 45, blur: 32, tint: 0.4 };
    let vigTouched = false, vigEl = null;

    function rgbToHex(rgb) {
      const m = String(rgb).match(/(\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return '#1466B8';
      return '#' + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function parsePos(val) {
      const m = String(val || '').match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
    }
    function findImage() {
      try {
        const doc = previewIframe.contentDocument;
        if (!doc) return null;
        // A selected card-explore card → adjust that card's poster image.
        if (selectedCard) {
          const esc = (window.CSS && CSS.escape) ? CSS.escape(selectedCard.label) : selectedCard.label;
          const poster = doc.querySelector(`[data-card="${esc}"] .tile-poster`);
          if (poster) return poster;
        }
        // Otherwise the slide-level image (incl. the tab-panel stage image).
        return doc.querySelector('[data-img-adjust]');
      } catch (e) { return null; }
    }
    function applyLive() {
      if (!imgEl) return;
      imgEl.style.setProperty('--img-pos', `${posX.toFixed(1)}% ${posY.toFixed(1)}%`);
      imgEl.style.setProperty('--img-scale', scale.toFixed(3));
    }
    // ── Matte + color-overlay live preview (slide-level image only) ──────────
    function applyMatteLive() { if (imgEl) imgEl.style.setProperty('--img-matte', String(matte)); }
    function applyOverlayLive() {
      const host = imgEl && imgEl.parentNode;
      if (!host) return;
      if (!overlayColor) { if (liveOverlayEl) { liveOverlayEl.remove(); liveOverlayEl = null; } return; }
      if (!liveOverlayEl) {
        liveOverlayEl = host.querySelector(':scope > .img-overlay');
        if (!liveOverlayEl) {
          liveOverlayEl = host.ownerDocument.createElement('div');
          liveOverlayEl.className = 'img-overlay';
          liveOverlayEl.setAttribute('aria-hidden', 'true');
          host.appendChild(liveOverlayEl);
        }
      }
      liveOverlayEl.style.background = overlayColor;
      liveOverlayEl.style.opacity = String(overlayOpacity);
    }
    // ── Vignette (uses the same .img-vignette layer the slide ships with) ────
    function parseVig(raw) {
      if (!raw) return null;
      const num = (re, d) => { const m = raw.match(re); return m ? parseFloat(m[1]) : d; };
      const c = raw.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
      return {
        mode: /\bspot\b/i.test(raw) ? 'spot' : 'focus',
        x: c ? parseFloat(c[1]) : 50, y: c ? parseFloat(c[2]) : 50,
        size: num(/size=(\d+(?:\.\d+)?)/i, 34), feather: num(/feather=(\d+(?:\.\d+)?)/i, 45),
        blur: num(/blur=(\d+(?:\.\d+)?)/i, 32), tint: num(/tint=(\d+(?:\.\d+)?)/i, 0.4),
      };
    }
    function applyVigLive() {
      if (vig.mode === 'off') { if (vigEl) { vigEl.remove(); vigEl = null; } return; }
      const doc = previewIframe.contentDocument;
      if (!doc || !imgEl) return;
      if (!vigEl) {
        vigEl = imgEl.parentElement.querySelector(':scope > .img-vignette') || doc.querySelector('.img-vignette');
        if (!vigEl) {
          vigEl = doc.createElement('div');
          vigEl.className = 'img-vignette';
          vigEl.setAttribute('aria-hidden', 'true');
          const blurImg = doc.createElement('img');
          blurImg.className = 'img-vignette__blur';
          blurImg.src = imgEl.getAttribute('src');
          blurImg.alt = '';
          blurImg.style.setProperty('--img-pos', imgEl.style.getPropertyValue('--img-pos') || 'center');
          blurImg.style.setProperty('--img-scale', imgEl.style.getPropertyValue('--img-scale') || '1');
          vigEl.appendChild(blurImg);
          imgEl.insertAdjacentElement('afterend', vigEl);
        }
      }
      vigEl.setAttribute('data-vig-mode', vig.mode);
      vigEl.style.setProperty('--vig-x', vig.x.toFixed(1) + '%');
      vigEl.style.setProperty('--vig-y', vig.y.toFixed(1) + '%');
      vigEl.style.setProperty('--vig-size', vig.size.toFixed(1) + '%');
      vigEl.style.setProperty('--vig-feather', Math.round(vig.feather) + '%');
      vigEl.style.setProperty('--vig-blur', Math.round(vig.blur) + 'px');
      vigEl.style.setProperty('--vig-tint', vig.tint.toFixed(2));
    }
    function serializeVig() {
      return `${vig.mode} ${vig.x.toFixed(1)}% ${vig.y.toFixed(1)}% size=${Math.round(vig.size)} feather=${Math.round(vig.feather)} blur=${Math.round(vig.blur)} tint=${vig.tint.toFixed(2)}`;
    }
    function positionToolbar() {
      if (!toolbar) return;
      const r = previewIframe.getBoundingClientRect();
      toolbar.style.left = (r.left + 14) + 'px';
      toolbar.style.top  = (r.top + 14) + 'px';
    }
    function makeToolbar() {
      if (adjustCard) return;  // matte/overlay apply to the slide-level image only
      if (!document.getElementById('iat-style')) {
        const st = document.createElement('style'); st.id = 'iat-style';
        st.textContent =
          '.img-adjust-toolbar{position:fixed;z-index:9999;display:flex;flex-direction:column;gap:10px;' +
          'background:rgba(20,20,24,.94);border:1px solid rgba(255,255,255,.14);border-radius:10px;' +
          'padding:12px 14px;font:12px/1.3 system-ui,sans-serif;color:#e8e8ea;box-shadow:0 10px 34px rgba(0,0,0,.55);}' +
          '.img-adjust-toolbar .iat-row{display:flex;align-items:center;gap:10px;}' +
          '.img-adjust-toolbar .iat-label{min-width:92px;opacity:.85;}' +
          '.img-adjust-toolbar input[type=range]{width:130px;}' +
          '.img-adjust-toolbar input[type=color]{width:34px;height:24px;border:none;background:none;padding:0;cursor:pointer;}' +
          '.img-adjust-toolbar .iat-btn{cursor:pointer;background:transparent;border:1px solid rgba(255,255,255,.22);color:#e8e8ea;border-radius:5px;padding:3px 8px;}' +
          '.img-adjust-toolbar .iat-btn.active{background:#D5001C;border-color:#D5001C;color:#fff;}' +
          '.img-adjust-toolbar input[type=range].iat-mini{width:64px;}' +
          '.img-adjust-toolbar .iat-vig-params[hidden]{display:none;}' +
          '.img-adjust-toolbar .iat-hint{opacity:.5;}';
        document.head.appendChild(st);
      }
      toolbar = document.createElement('div');
      toolbar.className = 'img-adjust-toolbar';
      toolbar.innerHTML =
        '<div class="iat-row"><span class="iat-label">Matte &amp; Haze</span>' +
        '<input type="range" class="iat-matte" min="0" max="100" step="1"></div>' +
        '<div class="iat-row"><span class="iat-label">Overlay</span>' +
        '<input type="color" class="iat-ovl-color" value="#1466B8">' +
        '<input type="range" class="iat-ovl-op" min="0" max="100" step="1" title="Overlay opacity">' +
        '<button type="button" class="iat-btn iat-ovl-clear" title="Remove overlay">Clear</button></div>' +
        '<div class="iat-row"><span class="iat-label">Vignette</span>' +
        '<button type="button" class="iat-btn iat-vig" data-m="off">Off</button>' +
        '<button type="button" class="iat-btn iat-vig" data-m="spot">Spot</button>' +
        '<button type="button" class="iat-btn iat-vig" data-m="focus">Focus</button></div>' +
        '<div class="iat-row iat-vig-params"><span class="iat-label">Feather/Blur/Tint</span>' +
        '<input type="range" class="iat-mini iat-vig-feather" min="0" max="95" step="1" title="Feather">' +
        '<input type="range" class="iat-mini iat-vig-blur" min="0" max="60" step="1" title="Blur">' +
        '<input type="range" class="iat-mini iat-vig-tint" min="0" max="100" step="1" title="Tint"></div>' +
        '<div class="iat-hint"></div>';
      document.body.appendChild(toolbar);
      const mr = toolbar.querySelector('.iat-matte'); mr.value = Math.round(matte * 100);
      const oc = toolbar.querySelector('.iat-ovl-color'); if (overlayColor) oc.value = overlayColor;
      const oo = toolbar.querySelector('.iat-ovl-op'); oo.value = Math.round(overlayOpacity * 100);
      // Keep control interactions from triggering the pan/zoom capture overlay.
      ['mousedown', 'wheel', 'click'].forEach(ev => toolbar.addEventListener(ev, e => e.stopPropagation()));
      mr.addEventListener('input', () => { matte = mr.value / 100; matteTouched = true; applyMatteLive(); });
      oc.addEventListener('input', () => { overlayColor = oc.value; overlayTouched = true; applyOverlayLive(); });
      oo.addEventListener('input', () => { overlayOpacity = oo.value / 100; overlayTouched = true; if (overlayColor) applyOverlayLive(); });
      toolbar.querySelector('.iat-ovl-clear').addEventListener('click', () => { overlayColor = null; overlayTouched = true; applyOverlayLive(); });
      // Vignette controls — when mode != off, drag moves the region + scroll resizes.
      const vigBtns = toolbar.querySelectorAll('.iat-vig');
      const vparams = toolbar.querySelector('.iat-vig-params');
      const vf = toolbar.querySelector('.iat-vig-feather'); vf.value = Math.round(vig.feather);
      const vb = toolbar.querySelector('.iat-vig-blur');     vb.value = Math.round(vig.blur);
      const vt = toolbar.querySelector('.iat-vig-tint');     vt.value = Math.round(vig.tint * 100);
      const hint = toolbar.querySelector('.iat-hint');
      function syncVig() {
        vigBtns.forEach(b => b.classList.toggle('active', b.dataset.m === vig.mode));
        vparams.hidden = (vig.mode === 'off');
        hint.textContent = (vig.mode === 'off')
          ? 'Drag to pan · scroll to zoom'
          : 'Vignette: drag to move · scroll to resize';
      }
      vigBtns.forEach(b => b.addEventListener('click', () => { vig.mode = b.dataset.m; vigTouched = true; applyVigLive(); syncVig(); }));
      vf.addEventListener('input', () => { vig.feather = parseFloat(vf.value); vigTouched = true; applyVigLive(); });
      vb.addEventListener('input', () => { vig.blur = parseFloat(vb.value); vigTouched = true; applyVigLive(); });
      vt.addEventListener('input', () => { vig.tint = parseFloat(vt.value) / 100; vigTouched = true; applyVigLive(); });
      syncVig();
      positionToolbar();
    }
    function dropToolbar() { if (toolbar) { toolbar.remove(); toolbar = null; } liveOverlayEl = null; }
    function repositionOverlay() {
      if (!overlay) return;
      const r = previewIframe.getBoundingClientRect();
      overlay.style.cssText =
        `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:9998;cursor:grab;`;
      positionToolbar();
    }
    function makeOverlay() {
      overlay = document.createElement('div');
      overlay.className = 'img-adjust-overlay';
      document.body.appendChild(overlay);
      repositionOverlay();
      overlay.addEventListener('mousedown', onDown);
      overlay.addEventListener('wheel', onWheel, { passive: false });
    }
    function dropOverlay() { if (overlay) { overlay.remove(); overlay = null; } }

    function onDown(e) {
      e.preventDefault();
      dragging = true;
      startX = e.clientX; startY = e.clientY; startPosX = posX; startPosY = posY; startVX = vig.x; startVY = vig.y;
      if (overlay) overlay.style.cursor = 'grabbing';
    }
    function onMove(e) {
      if (!dragging || !imgEl) return;
      const r = previewIframe.getBoundingClientRect();
      if (vig.mode !== 'off') {
        // Vignette mode: drag moves the region center (right → +x).
        vig.x = Math.max(0, Math.min(100, startVX + ((e.clientX - startX) / r.width) * 100));
        vig.y = Math.max(0, Math.min(100, startVY + ((e.clientY - startY) / r.height) * 100));
        vigTouched = true; applyVigLive();
        return;
      }
      // Drag right reveals the image's left → object-position x decreases.
      posX = Math.max(0, Math.min(100, startPosX - ((e.clientX - startX) / r.width) * 100));
      posY = Math.max(0, Math.min(100, startPosY - ((e.clientY - startY) / r.height) * 100));
      applyLive();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      if (overlay) overlay.style.cursor = 'grab';
    }
    function onWheel(e) {
      if (!imgEl) return;
      e.preventDefault();
      if (vig.mode !== 'off') {
        vig.size = Math.max(8, Math.min(80, vig.size - e.deltaY * 0.03));
        vigTouched = true; applyVigLive();
        return;
      }
      scale = Math.max(1, Math.min(3, scale - e.deltaY * 0.0015));
      applyLive();
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    function activate() {
      const slideId = slideSelector.value;
      if (!slideId) { appendConsole('[ADJUST] Select a slide to preview first.\n'); return; }
      if (previewMode !== 'slide') { appendConsole('[ADJUST] Switch to Slide Mode to adjust the image.\n'); return; }
      // A selected card is adjusted via its own Position/Scale fields; with
      // nothing selected, the slide-level image is adjusted (incl. tab-panel).
      adjustCard = selectedCard || null;
      imgEl = findImage();
      if (!imgEl) {
        appendConsole(`[ADJUST] ${slideId} has no adjustable image (this template has no image slot).\n`);
        adjustCard = null;
        return;
      }
      // Card tiles animate transform on hover; suppress it so live panning/zoom
      // is instant. The inline style is wiped on the next recompile/reload.
      if (adjustCard) imgEl.style.transition = 'none';
      const p = parsePos(imgEl.style.getPropertyValue('--img-pos') || getComputedStyle(imgEl).objectPosition);
      posX = p.x; posY = p.y;
      const s = parseFloat(imgEl.style.getPropertyValue('--img-scale'));
      scale = (isFinite(s) && s > 0) ? s : 1;
      // Read current matte + overlay (slide-level only) so controls start in sync.
      matteTouched = false; overlayTouched = false;
      matte = parseFloat(imgEl.style.getPropertyValue('--img-matte')) || 0;
      const exo = (!adjustCard && imgEl.parentNode) ? imgEl.parentNode.querySelector(':scope > .img-overlay') : null;
      if (exo) {
        overlayColor = rgbToHex(getComputedStyle(exo).backgroundColor);
        overlayOpacity = parseFloat(getComputedStyle(exo).opacity) || 0.3;
        liveOverlayEl = exo;
      } else { overlayColor = null; overlayOpacity = 0.3; liveOverlayEl = null; }
      // Read current vignette (slide-level only).
      vigTouched = false; vigEl = null;
      const pv = !adjustCard ? parseVig(readField(storyboardEditor.value, slideId, 'Image-Vignette')) : null;
      vig = pv ? Object.assign({ mode: 'off', x: 50, y: 50, size: 34, feather: 45, blur: 32, tint: 0.4 }, pv)
               : { mode: 'off', x: 50, y: 50, size: 34, feather: 45, blur: 32, tint: 0.4 };
      if (vig.mode !== 'off') applyVigLive();
      active = true;
      btnImgAdjust.classList.add('active');
      setAdjustBtn(true);
      makeOverlay();
      makeToolbar();
      window.addEventListener('resize', repositionOverlay);
      const whatfor = adjustCard ? `${slideId} · ${adjustCard.label}` : slideId;
      appendConsole(`>>> Adjust ON for ${whatfor} — drag to pan, scroll to zoom, click Save Framing to save (Esc cancels).\n`);
    }
    function teardown() {
      active = false;
      btnImgAdjust.classList.remove('active');
      setAdjustBtn(false);
      dropOverlay();
      dropToolbar();
      window.removeEventListener('resize', repositionOverlay);
      imgEl = null;
      adjustCard = null;
      vigEl = null;
    }
    function cancel() {
      if (!active) return;
      const slideId = slideSelector.value;
      teardown();
      if (slideId) updateIframeSrc(slideId);   // reload to discard live changes
      appendConsole('>>> Adjust cancelled — framing reverted.\n');
    }

    async function save() {
      const slideId = slideSelector.value;
      const card = adjustCard; // capture before teardown
      const posVal = `${posX.toFixed(1)}% ${posY.toFixed(1)}%`;
      const scaleVal = (scale.toFixed(3).replace(/\.?0+$/, '')) || '1';
      const posField   = card ? card.posField   : 'Image-Position';
      const scaleField = card ? card.scaleField : 'Image-Scale';
      if (!(await prepareEditorBase())) return;
      let text = storyboardEditor.value;
      text = upsertField(text, slideId, posField, posVal);
      text = upsertField(text, slideId, scaleField, scaleVal);
      // Matte + color overlay (slide-level image only) — write only what changed.
      let fxLog = '';
      if (!card && matteTouched) {
        text = upsertField(text, slideId, 'Image-Matte', String(matte));
        fxLog += `, Image-Matte ${matte}`;
      }
      if (!card && overlayTouched) {
        const ov = overlayColor ? `${overlayColor} ${overlayOpacity}` : '';
        text = upsertField(text, slideId, 'Image-Overlay', ov);
        fxLog += `, Image-Overlay ${ov || '(cleared)'}`;
      }
      if (!card && vigTouched) {
        if (vig.mode === 'off') { text = removeField(text, slideId, 'Image-Vignette'); fxLog += ', Image-Vignette (removed)'; }
        else { text = upsertField(text, slideId, 'Image-Vignette', serializeVig()); fxLog += `, Image-Vignette ${vig.mode}`; }
      }
      storyboardEditor.value = text;
      try {
        const res = await fetch('/api/storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text })
        });
        const data = await res.json();
        if (!data.success) { appendConsole(`[ADJUST] Save failed: ${data.error}\n`); return; }
        originalStoryboardContent = text;
        unsavedIndicator.classList.remove('active');
        appendConsole(`>>> Saved ${slideId}${card ? ' · ' + card.label : ''}: ${posField} ${posVal}, ${scaleField} ${scaleVal}${fxLog}. Recompiling...\n`);
      } catch (err) { appendConsole(`[ADJUST] Save error: ${err.message}\n`); return; }
      teardown();
      await triggerPipeline('/api/compile', btnImgAdjust);
      updateIframeSrc(slideId);
    }

    btnImgAdjust.addEventListener('click', () => { active ? save() : activate(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) cancel(); });
    slideSelector.addEventListener('change', () => { if (active) cancel(); });
    btnClosePreview.addEventListener('click', () => { if (active) cancel(); });
  })();

  // =========================================================================
  // Hotspot marker drag tool — reposition a hotspot slide's markers (and their
  // attached callout + connector line) by dragging, then save to the storyboard.
  // Writes Item-<Label>-Pos: X%, Y% per marker into course.md (never the slide
  // HTML), so Compile can't overwrite the placement. Design-time only — learners
  // see the final saved positions. Mirrors initImageAdjust's activate/save flow.
  // =========================================================================
  (function initHotspotDrag() {
    const btn = document.getElementById('btn-hotspot-drag');
    if (!btn) return;
    const setBtn = (saving) => {
      const ico = btn.querySelector('.pi');
      const lbl = btn.querySelector('.btn-label');
      if (ico) { ico.classList.toggle('pi-save', saving); ico.classList.toggle('pi-adjust', !saving); }
      if (lbl) lbl.textContent = saving ? 'Save Markers' : 'Drag Markers';
    };

    let active = false;
    let markers = [];   // [{ el, label, popover, x, y }]
    let overlay = null;
    let dragging = false, dragIdx = -1, startClientX = 0, startClientY = 0, startX = 0, startY = 0;

    function parseVar(el, name) {
      const m = String(el.style.getPropertyValue(name) || '').match(/(-?\d+(?:\.\d+)?)/);
      return m ? parseFloat(m[1]) : 50;
    }
    function findMarkers() {
      try {
        const doc = previewIframe.contentDocument;
        if (!doc) return [];
        return Array.from(doc.querySelectorAll('.hotspot')).map((el) => {
          const label = el.getAttribute('data-hs');
          const esc = (window.CSS && CSS.escape) ? CSS.escape(label) : label;
          const popover = doc.querySelector(`.popover[data-popover="${esc}"]`);
          return { el, label, popover, x: parseVar(el, '--hs-x'), y: parseVar(el, '--hs-y') };
        });
      } catch (e) { return []; }
    }
    // Move the marker and its attached popover together (both read --hs-x/--hs-y).
    function applyLive(m) {
      m.el.style.setProperty('--hs-x', m.x.toFixed(1) + '%');
      m.el.style.setProperty('--hs-y', m.y.toFixed(1) + '%');
      if (m.popover) {
        m.popover.style.setProperty('--hs-x', m.x.toFixed(1) + '%');
        m.popover.style.setProperty('--hs-y', m.y.toFixed(1) + '%');
      }
    }
    // Reveal only the grabbed marker's callout so the author can see what it covers.
    function showOnly(idx) {
      markers.forEach((m, i) => {
        const on = (i === idx);
        m.el.classList.toggle('is-active', on);
        if (m.popover) {
          m.popover.classList.toggle('is-active', on);
          if (on) m.popover.removeAttribute('hidden'); else m.popover.setAttribute('hidden', '');
        }
      });
    }

    function repositionOverlay() {
      if (!overlay) return;
      const r = previewIframe.getBoundingClientRect();
      overlay.style.cssText =
        `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:9998;cursor:grab;`;
    }
    function makeOverlay() {
      overlay = document.createElement('div');
      overlay.className = 'hotspot-drag-overlay';
      document.body.appendChild(overlay);
      repositionOverlay();
      overlay.addEventListener('mousedown', onDown);
    }
    function dropOverlay() { if (overlay) { overlay.remove(); overlay = null; } }

    function onDown(e) {
      e.preventDefault();
      const r = previewIframe.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      // Grab the nearest marker within ~7% of the click point.
      let best = -1, bestD = Infinity;
      markers.forEach((m, i) => {
        const d = Math.hypot(m.x - x, m.y - y);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best < 0 || bestD > 7) { dragIdx = -1; return; }
      dragIdx = best;
      dragging = true;
      startClientX = e.clientX; startClientY = e.clientY;
      startX = markers[best].x; startY = markers[best].y;
      showOnly(best);
      if (overlay) overlay.style.cursor = 'grabbing';
    }
    function onMove(e) {
      if (!dragging || dragIdx < 0) return;
      const r = previewIframe.getBoundingClientRect();
      const m = markers[dragIdx];
      // Marker follows the cursor (drag right → +x), clamped inside the stage.
      m.x = Math.max(2, Math.min(98, startX + ((e.clientX - startClientX) / r.width) * 100));
      m.y = Math.max(3, Math.min(97, startY + ((e.clientY - startClientY) / r.height) * 100));
      applyLive(m);
    }
    function onUp() { if (dragging) { dragging = false; if (overlay) overlay.style.cursor = 'grab'; } }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    function activate() {
      const slideId = slideSelector.value;
      if (!slideId) { appendConsole('[MARKERS] Select a slide to preview first.\n'); return; }
      if (previewMode !== 'slide') { appendConsole('[MARKERS] Switch to Slide Mode to drag markers.\n'); return; }
      const tpl = readField(storyboardEditor.value, slideId, 'Template-ID');
      if (tpl !== 'hotspot') { appendConsole(`[MARKERS] ${slideId} is not a hotspot slide (it's ${tpl || 'unknown'}).\n`); return; }
      markers = findMarkers();
      if (!markers.length) { appendConsole(`[MARKERS] No markers found on ${slideId} — compile it first.\n`); return; }
      // Unlock the stage so markers/popovers render at full strength while editing.
      try { const st = previewIframe.contentDocument.getElementById('hotspot-stage'); if (st) st.classList.remove('is-locked'); } catch (_) {}
      active = true;
      btn.classList.add('active');
      setBtn(true);
      makeOverlay();
      window.addEventListener('resize', repositionOverlay);
      appendConsole(`>>> Marker drag ON for ${slideId} (${markers.length} markers) — drag each marker to move its callout off important content; click Save Markers to save (Esc cancels).\n`);
    }
    function teardown() {
      active = false;
      btn.classList.remove('active');
      setBtn(false);
      dropOverlay();
      window.removeEventListener('resize', repositionOverlay);
      markers = [];
      dragIdx = -1;
    }
    function cancel() {
      if (!active) return;
      const slideId = slideSelector.value;
      teardown();
      if (slideId) updateIframeSrc(slideId);   // reload to discard live moves
      appendConsole('>>> Marker drag cancelled — positions reverted.\n');
    }

    async function save() {
      const slideId = slideSelector.value;
      const moved = markers.slice();           // capture before teardown
      if (!(await prepareEditorBase())) return;
      let text = storyboardEditor.value;
      moved.forEach((m) => {
        text = upsertField(text, slideId, `Item-${m.label}-Pos`, `${m.x.toFixed(1)}%, ${m.y.toFixed(1)}%`);
      });
      storyboardEditor.value = text;
      try {
        const res = await fetch('/api/storyboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text })
        });
        const data = await res.json();
        if (!data.success) { appendConsole(`[MARKERS] Save failed: ${data.error}\n`); return; }
        originalStoryboardContent = text;
        unsavedIndicator.classList.remove('active');
        appendConsole(`>>> Saved ${moved.length} marker position(s) on ${slideId}. Recompiling...\n`);
      } catch (err) { appendConsole(`[MARKERS] Save error: ${err.message}\n`); return; }
      teardown();
      await triggerPipeline('/api/compile-single', btn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideId })
      });
      updateIframeSrc(slideId);
    }

    btn.addEventListener('click', () => { active ? save() : activate(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) cancel(); });
    slideSelector.addEventListener('change', () => { if (active) cancel(); });
    btnClosePreview.addEventListener('click', () => { if (active) cancel(); });
  })();

  // =========================================================================
  // Movable blur/frost vignette tool — drop a soft region on a slide image to
  // hide an imperfection (Spot) or direct focus (Focus). Saves a single
  // `Image-Vignette` line to course.md; generate-slides re-injects the layer on
  // compile, so it survives recompiles like Image-Position/Scale do.
  // =========================================================================
  (function initImageVignette() {
    const btn = document.getElementById('btn-img-vignette');
    if (!btn) return;
    const strip        = document.getElementById('vignette-controls');
    const elBlur       = document.getElementById('vig-blur');
    const elTint       = document.getElementById('vig-tint');
    const elFeather    = document.getElementById('vig-feather');
    const elBlurVal    = document.getElementById('vig-blur-val');
    const elTintVal    = document.getElementById('vig-tint-val');
    const elFeatherVal = document.getElementById('vig-feather-val');
    const modeFocusBtn = document.getElementById('vig-mode-focus');
    const modeSpotBtn  = document.getElementById('vig-mode-spot');
    const removeBtn    = document.getElementById('btn-vig-remove');

    // Live CSS injected into the preview iframe so the vignette renders even on
    // slides compiled before .img-vignette shipped in slide-base.css.
    const VIG_CSS = `
.img-vignette { position:absolute; inset:0; z-index:1; pointer-events:none; overflow:hidden; }
.img-vignette__blur { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; object-position:var(--img-pos,center); transform:scale(var(--img-scale,1)); filter:blur(var(--vig-blur,32px)); }
.img-vignette[data-vig-mode="spot"] .img-vignette__blur { -webkit-mask-image:radial-gradient(var(--vig-size) var(--vig-size) at var(--vig-x) var(--vig-y), #000 calc(100% - var(--vig-feather)), transparent 100%); mask-image:radial-gradient(var(--vig-size) var(--vig-size) at var(--vig-x) var(--vig-y), #000 calc(100% - var(--vig-feather)), transparent 100%); }
.img-vignette[data-vig-mode="spot"]::after { content:''; position:absolute; inset:0; background:radial-gradient(var(--vig-size) var(--vig-size) at var(--vig-x) var(--vig-y), rgba(14,14,18,var(--vig-tint)) calc(100% - var(--vig-feather)), transparent 100%); }
.img-vignette[data-vig-mode="focus"] .img-vignette__blur { -webkit-mask-image:radial-gradient(var(--vig-size) var(--vig-size) at var(--vig-x) var(--vig-y), transparent calc(100% - var(--vig-feather)), #000 100%); mask-image:radial-gradient(var(--vig-size) var(--vig-size) at var(--vig-x) var(--vig-y), transparent calc(100% - var(--vig-feather)), #000 100%); }
.img-vignette[data-vig-mode="focus"]::after { content:''; position:absolute; inset:0; background:radial-gradient(var(--vig-size) var(--vig-size) at var(--vig-x) var(--vig-y), transparent calc(100% - var(--vig-feather)), rgba(14,14,18,var(--vig-tint)) 100%); }`;

    const DEFAULTS = { mode: 'focus', x: 50, y: 50, size: 34, feather: 45, blur: 32, tint: 0.4 };
    const v = Object.assign({}, DEFAULTS);
    let active = false, imgEl = null, vigEl = null, overlay = null;
    let dragging = false, startX = 0, startY = 0, startVX = 50, startVY = 50;

    const setBtn = (saving) => {
      const ico = btn.querySelector('.pi');
      const lbl = btn.querySelector('.btn-label');
      if (ico) { ico.classList.toggle('pi-save', saving); ico.classList.toggle('pi-blur', !saving); }
      if (lbl) lbl.textContent = saving ? 'Save Vignette' : 'Add Vignette';
    };
    function findImage() {
      try { const doc = previewIframe.contentDocument; return doc ? doc.querySelector('[data-img-adjust]') : null; }
      catch (e) { return null; }
    }
    function parseVig(raw) {
      if (!raw) return null;
      const num = (re, d) => { const m = raw.match(re); return m ? parseFloat(m[1]) : d; };
      const c = raw.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
      return {
        mode: /\bspot\b/i.test(raw) ? 'spot' : 'focus',
        x: c ? parseFloat(c[1]) : 50, y: c ? parseFloat(c[2]) : 50,
        size: num(/size=(\d+(?:\.\d+)?)/i, 34), feather: num(/feather=(\d+(?:\.\d+)?)/i, 45),
        blur: num(/blur=(\d+(?:\.\d+)?)/i, 32), tint: num(/tint=(\d+(?:\.\d+)?)/i, 0.4),
      };
    }
    function applyLive() {
      if (!vigEl) return;
      vigEl.setAttribute('data-vig-mode', v.mode);
      vigEl.style.setProperty('--vig-x', v.x.toFixed(1) + '%');
      vigEl.style.setProperty('--vig-y', v.y.toFixed(1) + '%');
      vigEl.style.setProperty('--vig-size', v.size.toFixed(1) + '%');
      vigEl.style.setProperty('--vig-feather', Math.round(v.feather) + '%');
      vigEl.style.setProperty('--vig-blur', Math.round(v.blur) + 'px');
      vigEl.style.setProperty('--vig-tint', v.tint.toFixed(2));
    }
    function syncControls() {
      modeFocusBtn.classList.toggle('active', v.mode === 'focus');
      modeSpotBtn.classList.toggle('active', v.mode === 'spot');
      elBlur.value = String(Math.round(v.blur));         elBlurVal.textContent = elBlur.value;
      elTint.value = String(Math.round(v.tint * 100));   elTintVal.textContent = elTint.value;
      elFeather.value = String(Math.round(v.feather));   elFeatherVal.textContent = elFeather.value;
    }
    function injectVig() {
      const doc = previewIframe.contentDocument;
      if (!doc.getElementById('vig-live-style')) {
        const st = doc.createElement('style');
        st.id = 'vig-live-style';
        st.textContent = VIG_CSS;
        (doc.head || doc.documentElement).appendChild(st);
      }
      // Reuse a vignette already in the compiled slide, else build one after the image.
      vigEl = imgEl.parentElement.querySelector('.img-vignette') || doc.querySelector('.img-vignette');
      if (!vigEl) {
        vigEl = doc.createElement('div');
        vigEl.className = 'img-vignette';
        vigEl.setAttribute('aria-hidden', 'true');
        const blurImg = doc.createElement('img');
        blurImg.className = 'img-vignette__blur';
        blurImg.src = imgEl.getAttribute('src');
        blurImg.alt = '';
        blurImg.style.setProperty('--img-pos', imgEl.style.getPropertyValue('--img-pos') || 'center');
        blurImg.style.setProperty('--img-scale', imgEl.style.getPropertyValue('--img-scale') || '1');
        vigEl.appendChild(blurImg);
        imgEl.insertAdjacentElement('afterend', vigEl);
      }
      applyLive();
    }
    function repositionOverlay() {
      if (!overlay) return;
      const r = previewIframe.getBoundingClientRect();
      overlay.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:9998;cursor:grab;`;
    }
    function makeOverlay() {
      overlay = document.createElement('div');
      overlay.className = 'img-adjust-overlay';
      document.body.appendChild(overlay);
      repositionOverlay();
      overlay.addEventListener('mousedown', onDown);
      overlay.addEventListener('wheel', onWheel, { passive: false });
    }
    function dropOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
    function onDown(e) { e.preventDefault(); dragging = true; startX = e.clientX; startY = e.clientY; startVX = v.x; startVY = v.y; if (overlay) overlay.style.cursor = 'grabbing'; }
    function onMove(e) {
      if (!dragging || !vigEl) return;
      const r = previewIframe.getBoundingClientRect();
      // Drag moves the region center directly (right → +x).
      v.x = Math.max(0, Math.min(100, startVX + ((e.clientX - startX) / r.width) * 100));
      v.y = Math.max(0, Math.min(100, startVY + ((e.clientY - startY) / r.height) * 100));
      applyLive();
    }
    function onUp() { if (!dragging) return; dragging = false; if (overlay) overlay.style.cursor = 'grab'; }
    function onWheel(e) { if (!vigEl) return; e.preventDefault(); v.size = Math.max(8, Math.min(80, v.size - e.deltaY * 0.03)); applyLive(); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);

    function activate() {
      const slideId = slideSelector.value;
      if (!slideId) { appendConsole('[VIGNETTE] Select a slide to preview first.\n'); return; }
      if (previewMode !== 'slide') { appendConsole('[VIGNETTE] Switch to Slide Mode to add a vignette.\n'); return; }
      imgEl = findImage();
      if (!imgEl) { appendConsole(`[VIGNETTE] ${slideId} has no adjustable image (this template has no image slot).\n`); return; }
      Object.assign(v, DEFAULTS, parseVig(readField(storyboardEditor.value, slideId, 'Image-Vignette')) || {});
      injectVig();
      syncControls();
      active = true;
      btn.classList.add('active');
      setBtn(true);
      strip.hidden = false;
      makeOverlay();
      window.addEventListener('resize', repositionOverlay);
      appendConsole(`>>> Vignette ON for ${slideId} — drag to move, scroll to resize, Save Vignette to save (Esc cancels).\n`);
    }
    function teardown() {
      active = false;
      btn.classList.remove('active');
      setBtn(false);
      strip.hidden = true;
      dropOverlay();
      window.removeEventListener('resize', repositionOverlay);
      imgEl = null; vigEl = null;
    }
    function cancel() {
      if (!active) return;
      const slideId = slideSelector.value;
      teardown();
      if (slideId) updateIframeSrc(slideId);
      appendConsole('>>> Vignette cancelled — reverted.\n');
    }
    function serialize() {
      return `${v.mode} ${v.x.toFixed(1)}% ${v.y.toFixed(1)}% size=${Math.round(v.size)} feather=${Math.round(v.feather)} blur=${Math.round(v.blur)} tint=${v.tint.toFixed(2)}`;
    }
    async function persist(text, msg) {
      storyboardEditor.value = text;
      try {
        const res = await fetch('/api/storyboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
        const data = await res.json();
        if (!data.success) { appendConsole(`[VIGNETTE] Save failed: ${data.error}\n`); return false; }
        originalStoryboardContent = text;
        unsavedIndicator.classList.remove('active');
        appendConsole(msg);
        return true;
      } catch (err) { appendConsole(`[VIGNETTE] Save error: ${err.message}\n`); return false; }
    }
    async function save() {
      const slideId = slideSelector.value;
      const val = serialize();
      if (!(await prepareEditorBase())) return;
      const ok = await persist(upsertField(storyboardEditor.value, slideId, 'Image-Vignette', val),
        `>>> Saved ${slideId}: Image-Vignette ${val}. Recompiling...\n`);
      if (!ok) return;
      teardown();
      await triggerPipeline('/api/compile', btn);
      updateIframeSrc(slideId);
    }
    async function remove() {
      const slideId = slideSelector.value;
      if (!(await prepareEditorBase())) return;
      const ok = await persist(removeField(storyboardEditor.value, slideId, 'Image-Vignette'),
        `>>> Removed vignette from ${slideId}. Recompiling...\n`);
      if (!ok) return;
      teardown();
      await triggerPipeline('/api/compile', btn);
      updateIframeSrc(slideId);
    }

    modeFocusBtn.addEventListener('click', () => { v.mode = 'focus'; syncControls(); applyLive(); });
    modeSpotBtn.addEventListener('click',  () => { v.mode = 'spot';  syncControls(); applyLive(); });
    elBlur.addEventListener('input',    () => { v.blur = parseFloat(elBlur.value);          elBlurVal.textContent = elBlur.value;       applyLive(); });
    elTint.addEventListener('input',    () => { v.tint = parseFloat(elTint.value) / 100;    elTintVal.textContent = elTint.value;       applyLive(); });
    elFeather.addEventListener('input', () => { v.feather = parseFloat(elFeather.value);     elFeatherVal.textContent = elFeather.value; applyLive(); });
    removeBtn.addEventListener('click', () => { if (active) remove(); });
    btn.addEventListener('click', () => { active ? save() : activate(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active) cancel(); });
    slideSelector.addEventListener('change', () => { if (active) cancel(); });
  })();

  // =========================================================================
  // Animation editor — assign VO-synced GSAP presets to slide elements.
  // Saves to course/assets/animation-cues/<id>.json (POST /api/slide-cues),
  // then recompiles. Live preview pushes cues into the iframe's SlideAnimator.
  // Never touches template entrance animations.
  // =========================================================================
  (function initAnimationEditor() {
    var panel = document.getElementById('tab-animations');
    if (!panel) return;
    var $a = function (id) { return document.getElementById(id); };
    var elTarget = $a('anim-target'), elPreset = $a('anim-preset'), elEase = $a('anim-ease'),
        elStart = $a('anim-start'), elDur = $a('anim-duration'), elDelay = $a('anim-delay'),
        elAfter = $a('anim-after'), elReturn = $a('anim-return'), elReturnAt = $a('anim-return-at'),
        elReturnCap = $a('anim-return-cap'), elStartCap = $a('anim-start-cap'),
        elParamsWrap = $a('anim-params-wrap'), elParams = $a('anim-params'),
        list = $a('anim-list'), slideLabel = $a('anim-slide-label'),
        btnPick = $a('btn-anim-pick'), btnAdd = $a('btn-anim-add'), btnCancel = $a('btn-anim-cancel'),
        btnPreview = $a('btn-anim-preview'), btnApply = $a('btn-anim-apply'), tabBtn = $a('tab-btn-animations');

    var PRESETS = ['fadeIn','fadeOut','scaleUp','scaleDown','moveInLeft','moveInRight','moveInUp','moveInDown','slideOut','rotate','pulse','bounce','highlight','shake','custom'];
    PRESETS.forEach(function (p) { var o = document.createElement('option'); o.value = p; o.textContent = p; elPreset.appendChild(o); });

    var cues = [];           // working list of cue objects
    var editingIdx = -1;     // index being edited; -1 = adding new
    var pickActive = false, pickDoc = null, pickPrevOutline = '';

    function idoc() { try { return previewIframe.contentDocument; } catch (_) { return null; } }
    function iwin() { try { return previewIframe.contentWindow; } catch (_) { return null; } }
    function curTime() { try { return window.CourseRuntime.getAudioCurrentTime() || 0; } catch (_) { return 0; } }
    function fmt(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2); }

    function ensureAnimator(cb) {
      var win = iwin(), doc = idoc();
      if (!win || !doc) { cb(false); return; }
      if (win.SlideAnimator) { cb(true); return; }
      function inject(src, done) {
        var s = doc.createElement('script'); s.src = src;
        s.onload = done; s.onerror = function () { done(); };
        doc.body.appendChild(s);
      }
      var loadAnim = function () { inject('../assets/vendor/slide-animator.js', function () { cb(!!win.SlideAnimator); }); };
      if (!win.gsap) inject('../assets/vendor/gsap/gsap.min.js', loadAnim); else loadAnim();
    }

    function selectorFor(node) {
      if (!node || node.nodeType !== 1) return '';
      if (node.id) return '#' + node.id;
      var parts = [], el = node;
      while (el && el.nodeType === 1 && el.tagName.toLowerCase() !== 'body') {
        if (el.id) { parts.unshift('#' + el.id); break; }
        var sel = el.tagName.toLowerCase(), parent = el.parentElement;
        if (parent) {
          var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName; });
          if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(el) + 1) + ')';
        }
        parts.unshift(sel);
        el = parent;
      }
      return parts.join(' > ');
    }

    // ── Element pick ──────────────────────────────────────────────────────
    function onPickOver(e) {
      if (pickPrevEl) pickPrevEl.style.outline = pickPrevOutline;
      pickPrevEl = e.target; pickPrevOutline = e.target.style.outline || '';
      e.target.style.outline = '2px solid #D5001C';
    }
    var pickPrevEl = null;
    function onPickClick(e) {
      e.preventDefault(); e.stopPropagation();
      elTarget.value = selectorFor(e.target);
      disarmPick();
    }
    function armPick() {
      if (previewMode !== 'slide') { appendConsole('[ANIM] Switch to Slide Mode to pick an element.\n'); return; }
      var doc = idoc(); if (!doc) { appendConsole('[ANIM] Preview not ready.\n'); return; }
      pickActive = true; pickDoc = doc; btnPick.classList.add('active');
      doc.body.style.cursor = 'crosshair';
      doc.addEventListener('mouseover', onPickOver, true);
      doc.addEventListener('click', onPickClick, true);
      appendConsole('>>> Pick a slide element (Esc cancels)…\n');
    }
    function disarmPick() {
      if (!pickActive) return;
      pickActive = false; btnPick.classList.remove('active');
      if (pickPrevEl) { pickPrevEl.style.outline = pickPrevOutline; pickPrevEl = null; }
      if (pickDoc) {
        pickDoc.body.style.cursor = '';
        pickDoc.removeEventListener('mouseover', onPickOver, true);
        pickDoc.removeEventListener('click', onPickClick, true);
        pickDoc = null;
      }
    }

    // ── Form <-> cue object ─────────────────────────────────────────────────
    function togglePresetParams() { elParamsWrap.hidden = elPreset.value !== 'custom'; }
    function toggleReturn() {
      var on = elReturn.checked;
      elReturnAt.disabled = !on; elReturnCap.disabled = !on;
    }
    function readForm() {
      var at = parseFloat(elStart.value);
      var cue = {
        target: elTarget.value.trim(),
        preset: elPreset.value,
        at: isFinite(at) ? at : 0,
        duration: parseFloat(elDur.value) || 0.5,
        ease: elEase.value,
        delay: parseFloat(elDelay.value) || 0,
        afterEntrance: !!elAfter.checked
      };
      if (elReturn.checked) {
        cue.return = true;
        var ra = parseFloat(elReturnAt.value);
        if (isFinite(ra)) cue.returnAt = ra;
      }
      if (elPreset.value === 'custom') {
        try { cue.params = JSON.parse(elParams.value || '{}'); } catch (_) { cue.params = {}; }
      }
      return cue;
    }
    function writeForm(c) {
      elTarget.value = c.target || '';
      elPreset.value = c.preset || 'highlight'; togglePresetParams();
      elEase.value = c.ease || 'power2.out';
      elStart.value = (c.at != null) ? c.at : '';
      elDur.value = (c.duration != null) ? c.duration : 0.5;
      elDelay.value = (c.delay != null) ? c.delay : 0;
      elAfter.checked = c.afterEntrance !== false;
      elReturn.checked = !!c.return; toggleReturn();
      elReturnAt.value = (c.returnAt != null) ? c.returnAt : '';
      elParams.value = c.params ? JSON.stringify(c.params) : '';
    }
    function clearForm() {
      writeForm({ preset: 'highlight', duration: 0.5, delay: 0, afterEntrance: true });
      elTarget.value = '';
      editingIdx = -1;
      btnAdd.textContent = 'Add animation';
      btnCancel.hidden = true;
    }

    // ── List rendering ──────────────────────────────────────────────────────
    function renderList() {
      list.innerHTML = '';
      cues.forEach(function (c, i) {
        var li = document.createElement('li');
        li.className = 'anim-card' + (i === editingIdx ? ' editing' : '');
        var main = document.createElement('div'); main.className = 'anim-card-main';
        var title = document.createElement('div'); title.className = 'anim-card-title';
        title.textContent = c.preset + '  →  ' + c.target;
        var sub = document.createElement('div'); sub.className = 'anim-card-sub';
        sub.textContent = '@' + fmt(c.at) + 's · ' + fmt(c.duration) + 's' +
          (c.return ? (' · ↩ ' + (c.returnAt != null ? fmt(c.returnAt) + 's' : 'end')) : '') +
          (c.afterEntrance === false ? ' · on load' : '');
        main.appendChild(title); main.appendChild(sub);
        var del = document.createElement('button'); del.className = 'anim-card-del'; del.textContent = '×'; del.title = 'Delete';
        del.addEventListener('click', function (e) { e.stopPropagation(); cues.splice(i, 1); if (editingIdx === i) clearForm(); renderList(); pushLive(); });
        main.addEventListener('click', function () { editingIdx = i; writeForm(c); btnAdd.textContent = 'Update animation'; btnCancel.hidden = false; renderList(); });
        li.appendChild(main); li.appendChild(del);
        list.appendChild(li);
      });
    }

    // ── Live preview ────────────────────────────────────────────────────────
    function pushLive() {
      if (previewMode !== 'slide') return;
      ensureAnimator(function (ok) {
        if (!ok) return;
        var win = iwin();
        try { win.SlideAnimator.load(cues); win.SlideAnimator.previewAt(curTime()); } catch (_) {}
      });
    }
    function preview() {
      if (previewMode !== 'slide') { appendConsole('[ANIM] Switch to Slide Mode to preview.\n'); return; }
      var cue = readForm();
      if (!cue.target) { appendConsole('[ANIM] Pick an element first, then Preview.\n'); return; }
      // include the in-progress edit in the live set
      var working = cues.slice();
      if (editingIdx >= 0) working[editingIdx] = cue; else working.push(cue);
      var at = cue.at || 0;
      var from = Math.max(0, at - 0.6);
      var to = Math.max(at + (cue.duration || 0.5), (cue.returnAt != null ? cue.returnAt : 0)) + 0.6;
      ensureAnimator(function (ok) {
        if (!ok) { appendConsole('[ANIM] Could not load the animator in the preview.\n'); return; }
        var win = iwin();
        try {
          win.SlideAnimator.load(working);
          win.SlideAnimator.simulate(from, to);   // deterministic visual playback
        } catch (e) { appendConsole('[ANIM] Preview error: ' + e.message + '\n'); return; }
        // Also nudge the VO so the author can hear the narration alignment (best-effort).
        var aud = window.CourseRuntime.activeAudio;
        if (aud && isFinite(aud.duration)) { try { aud.currentTime = from; aud.play(); } catch (_) {} }
        appendConsole('>>> Previewing ' + cue.preset + ' on ' + cue.target + ' (' + from.toFixed(1) + 's→' + to.toFixed(1) + 's)\n');
      });
    }

    function addOrUpdate() {
      var cue = readForm();
      if (!cue.target) { appendConsole('[ANIM] Pick an element or enter a selector first.\n'); return; }
      if (editingIdx >= 0) cues[editingIdx] = cue; else cues.push(cue);
      clearForm(); renderList(); pushLive();
    }

    async function loadForSlide() {
      var slideId = slideSelector.value;
      slideLabel.textContent = slideId
        ? (previewMode === 'slide' ? (slideId + ' — VO-synced animations') : (slideId + ' — switch to Slide Mode to preview'))
        : 'Select a slide in Slide Mode';
      disarmPick(); clearForm();
      if (!slideId) { cues = []; renderList(); return; }
      try {
        var res = await fetch('/api/slide-cues?slide=' + encodeURIComponent(slideId));
        var data = await res.json();
        cues = Array.isArray(data.cues) ? data.cues : [];
      } catch (_) { cues = []; }
      renderList(); pushLive();
    }

    async function apply() {
      var slideId = slideSelector.value;
      if (!slideId) { appendConsole('[ANIM] Select a slide first.\n'); return; }
      try {
        var res = await fetch('/api/slide-cues', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slideId: slideId, data: { cues: cues } })
        });
        var data = await res.json();
        if (!data.success) { appendConsole('[ANIM] Save failed: ' + (data.error || '?') + '\n'); return; }
        appendConsole('>>> Saved ' + cues.length + ' animation(s) for ' + slideId + '. Recompiling…\n');
      } catch (err) { appendConsole('[ANIM] Save error: ' + err.message + '\n'); return; }
      await triggerPipeline('/api/compile', btnApply);
      updateIframeSrc(slideId);
    }

    // ── Wiring ──────────────────────────────────────────────────────────────
    elPreset.addEventListener('change', togglePresetParams);
    elReturn.addEventListener('change', toggleReturn);
    elStartCap.addEventListener('click', function () { elStart.value = fmt(curTime()); });
    elReturnCap.addEventListener('click', function () { if (!elReturnCap.disabled) elReturnAt.value = fmt(curTime()); });
    btnPick.addEventListener('click', function () { pickActive ? disarmPick() : armPick(); });
    btnAdd.addEventListener('click', addOrUpdate);
    btnCancel.addEventListener('click', clearForm);
    btnPreview.addEventListener('click', preview);
    btnApply.addEventListener('click', apply);
    if (tabBtn) tabBtn.addEventListener('click', loadForSlide);
    slideSelector.addEventListener('change', function () { if (tabBtn && tabBtn.classList.contains('active')) loadForSlide(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pickActive) disarmPick(); });

    clearForm();
  })();

  // =========================================================================
  // Start New Module wizard — scaffolds a sibling module from the template,
  // stamps the Player title, optionally creates+pushes a GitHub repo, and
  // auto-launches the new module's own dashboard. Streams /api/new-module.
  // =========================================================================
  (function initModuleWizard() {
    const btnOpen = document.getElementById('btn-start-module');
    const wiz = document.getElementById('module-wizard');
    const scrim = document.getElementById('module-wizard-scrim');
    if (!btnOpen || !wiz || !scrim) return;
    const $w = (id) => document.getElementById(id);
    const elCode = $w('wiz-code'), elTitle = $w('wiz-title'), elLocation = $w('wiz-location'),
          elRepo = $w('wiz-repo'), elFolderPrev = $w('wiz-folder-preview'), elError = $w('wiz-error'),
          elForm = $w('wiz-form'), elProgress = $w('wiz-progress'), elConsole = $w('wiz-console'),
          elStatus = $w('wiz-status'), elSuccess = $w('wiz-success'), elSuccessMsg = $w('wiz-success-msg'),
          elOpen = $w('btn-wiz-open'),
          btnSubmit = $w('btn-wiz-submit'), btnCancel = $w('btn-wiz-cancel'),
          btnClose = $w('btn-wiz-close'), btnDone = $w('btn-wiz-done');

    let streaming = false;
    const CODE_RE = /^[A-Z]{2}\d{2,}$/;

    function setError(msg) { if (!msg) { elError.hidden = true; elError.textContent = ''; } else { elError.hidden = false; elError.textContent = msg; } }
    function updateFolderPreview() {
      const code = elCode.value.trim().toUpperCase();
      elFolderPrev.textContent = code ? `Porsche-WBT-${code}` : 'Porsche-WBT-…';
    }

    async function open() {
      // reset to form view
      setError(''); elForm.hidden = false; elProgress.hidden = true; elSuccess.hidden = true;
      elConsole.textContent = ''; btnSubmit.disabled = false; btnSubmit.style.opacity = '1';
      updateFolderPreview();
      // prefill default location from the server (the projects parent folder)
      if (!elLocation.value) {
        try {
          const d = await (await fetch('/api/new-module/defaults')).json();
          if (d && d.parent) elLocation.value = d.parent;
          if (d && d.templateExists === false) setError('Warning: template folder not found at ' + d.template);
        } catch (_) {}
      }
      scrim.hidden = false; wiz.hidden = false;
      requestAnimationFrame(() => { scrim.classList.add('open'); wiz.classList.add('open'); });
      setTimeout(() => elCode.focus(), 60);
    }
    function close() {
      if (streaming) return; // don't close mid-create
      scrim.classList.remove('open'); wiz.classList.remove('open');
      setTimeout(() => { scrim.hidden = true; wiz.hidden = true; }, 250);
    }

    async function submit() {
      setError('');
      const code = elCode.value.trim().toUpperCase();
      const title = elTitle.value.trim();
      const location = elLocation.value.trim();
      const createRepo = elRepo.checked;
      if (!CODE_RE.test(code)) { setError('Module code must be two letters + 2+ digits, e.g. CC09 or HV02.'); elCode.focus(); return; }
      if (!title) { setError('Module title is required.'); elTitle.focus(); return; }

      // switch to progress view
      streaming = true;
      elForm.hidden = true; elProgress.hidden = false; elSuccess.hidden = true;
      elStatus.textContent = `Creating module ${code}…`;
      elConsole.textContent = '';
      setBusy(true, 'Creating module…');

      let localOk = false, repoOk = null, dashUrl = '';
      try {
        const resp = await fetch('/api/new-module', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, title, playerTitle: title, createRepo, location })
        });
        if (!resp.ok) {
          let msg = 'Request rejected.';
          try { msg = (await resp.json()).error || msg; } catch (_) {}
          throw new Error(msg);
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder('utf-8');
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          let chunk = dec.decode(value, { stream: true });
          if (chunk.includes('__MODULE_CREATED__')) localOk = true;
          if (chunk.includes('__REPO_OK__')) repoOk = true;
          if (chunk.includes('__REPO_FAIL__')) repoOk = false;
          const m = chunk.match(/__DASHBOARD_URL__(\S+)/);
          if (m) dashUrl = m[1];
          // strip sentinels from the visible log
          chunk = chunk.replace(/__MODULE_CREATED__|__REPO_OK__|__REPO_FAIL__|__DASHBOARD_URL__\S*/g, '').trimEnd();
          if (chunk) { elConsole.textContent += chunk + '\n'; elConsole.scrollTop = elConsole.scrollHeight; }
        }
      } catch (err) {
        elConsole.textContent += `\n[ERROR] ${err.message}\n`;
        elConsole.scrollTop = elConsole.scrollHeight;
      } finally {
        streaming = false;
        setBusy(false);
      }

      if (localOk) {
        showToast(`Module ${code} created`, 'success');
        let html = `<div><span class="ok">✓</span> Local module <code>Porsche-WBT-${code}</code> created.</div>`;
        if (createRepo) {
          html += repoOk
            ? `<div><span class="ok">✓</span> GitHub repo created &amp; pushed.</div>`
            : `<div><span class="warn">⚠</span> GitHub step did not complete — your local module is safe (see log).</div>`;
        }
        html += `<div style="margin-top:10px">Next: open the new module's dashboard, then add its learning materials.</div>`;
        elSuccessMsg.innerHTML = html;
        if (dashUrl) { elOpen.href = dashUrl; elOpen.hidden = false; } else { elOpen.hidden = true; }
        elProgress.hidden = true; elSuccess.hidden = false;
      } else {
        showToast('Module creation failed — see log', 'error');
        // keep the log visible; offer to go back to the form
        elStatus.textContent = 'Creation failed. Review the log above.';
      }
    }

    btnOpen.addEventListener('click', open);
    btnClose.addEventListener('click', close);
    btnCancel.addEventListener('click', close);
    if (btnDone) btnDone.addEventListener('click', close);
    btnSubmit.addEventListener('click', submit);
    elCode.addEventListener('input', () => { updateFolderPreview(); setError(''); });
    elCode.addEventListener('blur', () => { elCode.value = elCode.value.trim().toUpperCase(); });
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !wiz.hidden && !streaming) close();
      if (e.key === 'Enter' && !wiz.hidden && !streaming && elForm && !elForm.hidden && e.target.tagName !== 'TEXTAREA') submit();
    });
  })();
});

/* =========================================================================
   Review Notes panel
   Reads the review/ folder via the dashboard server, shows SME/instructor
   comments grouped by slide, lets you jump to a slide in the preview, check
   notes off (persisted to review/resolved.json), and auto-follows the slide
   you're previewing. Self-contained: queries the DOM by id, so it does not
   depend on the main dashboard closure above.
   ========================================================================= */
(function () {
  'use strict';

  function init() {
    var btn = document.getElementById('btn-review-toggle');
    var panel = document.getElementById('review-panel');
    if (!btn || !panel) return;

    var countTop = document.getElementById('review-note-count');
    var countHead = document.getElementById('review-panel-count');
    var sub = document.getElementById('review-panel-sub');
    var body = document.getElementById('review-panel-body');
    var btnClose = document.getElementById('btn-review-close');
    var btnRefresh = document.getElementById('btn-review-refresh');
    var selector = document.getElementById('preview-slide-selector');

    var notes = [];
    var resolved = new Set();

    function currentSlideId() { return selector ? selector.value : ''; }

    function setCount(n) {
      var s = String(n);
      if (countTop) countTop.textContent = s;
      if (countHead) countHead.textContent = s;
    }

    function setButtonEnabled(hasNotes) {
      btn.disabled = !hasNotes;
      btn.title = hasNotes
        ? 'Review notes from SMEs / instructors'
        : 'No review notes found — drop exported files in review/inbox';
    }

    function fmtDate(iso) { return String(iso || '').slice(0, 10); }

    function jumpToSlide(slideId) {
      if (!selector || !slideId) return;
      var exists = Array.prototype.some.call(selector.options, function (o) { return o.value === slideId; });
      if (!exists) return;
      selector.value = slideId;
      selector.dispatchEvent(new Event('change'));
    }

    function render() {
      setCount(notes.length);
      if (!notes.length) {
        sub.textContent = '';
        body.innerHTML = '<div class="review-empty-state">No review notes found.<br>Drop exported files in <code>review/inbox</code> and click refresh.</div>';
        return;
      }
      var resolvedCount = notes.filter(function (n) { return resolved.has(n.id); }).length;
      sub.textContent = resolvedCount + ' of ' + notes.length + ' resolved';

      var groups = [];
      var byId = {};
      notes.slice().sort(function (a, b) {
        var ai = Number(a.slideIndex), bi = Number(b.slideIndex);
        if (isFinite(ai) && isFinite(bi) && ai !== bi) return ai - bi;
        return String(a.slideId || '').localeCompare(String(b.slideId || '')) ||
               String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      }).forEach(function (n) {
        var key = n.slideId || '(unknown)';
        if (!byId[key]) { byId[key] = { id: key, title: n.slideTitle || '', items: [] }; groups.push(byId[key]); }
        byId[key].items.push(n);
        if (!byId[key].title && n.slideTitle) byId[key].title = n.slideTitle;
      });

      var cur = currentSlideId();
      body.innerHTML = '';
      groups.forEach(function (g) {
        var wrap = document.createElement('div');
        wrap.className = 'rv-slide-group' + (g.id === cur ? ' is-current' : '');

        var head = document.createElement('button');
        head.type = 'button';
        head.className = 'rv-slide-head';
        head.title = 'Open ' + g.id + ' in the preview';
        var idSpan = document.createElement('span');
        idSpan.className = 'rv-slide-id';
        idSpan.textContent = g.id;
        var titleSpan = document.createElement('span');
        titleSpan.className = 'rv-slide-title';
        titleSpan.textContent = g.title || '';
        head.appendChild(idSpan);
        head.appendChild(titleSpan);
        head.addEventListener('click', function () { jumpToSlide(g.id); });
        wrap.appendChild(head);

        g.items.forEach(function (n) {
          var isDone = resolved.has(n.id);
          var note = document.createElement('div');
          note.className = 'rv-note' + (isDone ? ' is-resolved' : '');

          var chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.className = 'rv-note-check';
          chk.checked = isDone;
          chk.title = 'Mark resolved';
          chk.addEventListener('change', function () { toggleResolved(n.id, chk.checked); });

          var main = document.createElement('div');
          main.className = 'rv-note-main';
          var txt = document.createElement('div');
          txt.className = 'rv-note-text';
          txt.textContent = n.text || '';
          var meta = document.createElement('div');
          meta.className = 'rv-note-meta';
          var at = (n.audioTime != null && n.audioTime > 0) ? ' · @' + n.audioTime + 's' : '';
          meta.textContent = (n.reviewer || '—') + ' · ' + fmtDate(n.createdAt) + at;
          main.appendChild(txt);
          main.appendChild(meta);

          note.appendChild(chk);
          note.appendChild(main);
          wrap.appendChild(note);
        });
        body.appendChild(wrap);
      });

      var curGroup = body.querySelector('.rv-slide-group.is-current');
      if (curGroup && curGroup.scrollIntoView) curGroup.scrollIntoView({ block: 'nearest' });
    }

    function toggleResolved(id, isResolved) {
      if (isResolved) resolved.add(id); else resolved.delete(id);
      render();
      fetch('/api/review-notes/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, resolved: isResolved })
      }).catch(function () { /* keep optimistic UI; will reconcile on next load */ });
    }

    function load() {
      return fetch('/api/review-notes', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : { notes: [], resolved: [] }; })
        .then(function (data) {
          notes = Array.isArray(data.notes) ? data.notes : [];
          resolved = new Set(Array.isArray(data.resolved) ? data.resolved : []);
          setButtonEnabled(notes.length > 0);
          setCount(notes.length);
          if (!panel.hidden) render();
        })
        .catch(function () { setButtonEnabled(false); setCount(0); });
    }

    function open() {
      if (btn.disabled) return;
      panel.hidden = false;
      requestAnimationFrame(function () { panel.classList.add('open'); });
      render();
    }
    function close() {
      panel.classList.remove('open');
      setTimeout(function () { panel.hidden = true; }, 250);
    }

    btn.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
    if (btnClose) btnClose.addEventListener('click', close);
    if (btnRefresh) btnRefresh.addEventListener('click', function () { load(); });
    if (selector) selector.addEventListener('change', function () { if (!panel.hidden) render(); });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
