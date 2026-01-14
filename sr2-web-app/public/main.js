async function $(id){ return document.getElementById(id) }

const uploadBtn = await $('uploadBtn');
const craftFile = await $('craftFile');
const status = await $('status');
const generateBtn = await $('generateBtn');
const craftName = await $('craftName');
const description = await $('description');
const uploadedSelect = await $('uploadedTemplates');

function setStatus(msg, ok=true, showSpinner=false){ status.textContent = msg; status.style.color = ok? '#222':'#b00';
  if (showSpinner) {
    if (!document.getElementById('statusSpinner')){
      const s = document.createElement('span'); s.id='statusSpinner'; s.className='spinner'; status.appendChild(s);
    }
  } else {
    const sp = document.getElementById('statusSpinner'); if (sp) sp.remove();
  }
}

async function refreshTemplates(){
  const res = await fetch('/templates');
  const data = await res.json();
  uploadedSelect.innerHTML = '<option value="">— uploaded templates —</option>' + (data.templates||[]).map(f=>`<option value="${f}">${f}</option>`).join('');
}

uploadBtn.addEventListener('click', async ()=>{
  const file = craftFile.files[0];
  if (!file){ setStatus('Please choose a .craft file to upload', false); return; }
  const form = new FormData(); form.append('craftFile', file);
  setStatus('Uploading...');
  const res = await fetch('/upload', { method:'POST', body: form });
  const data = await res.json();
  if (data.ok){ setStatus('Uploaded: ' + data.original); await refreshTemplates(); }
  else setStatus('Upload failed', false);
});

// Generate and download
generateBtn.addEventListener('click', async ()=>{
  const name = craftName.value || 'GeneratedCraft';
  const desc = description.value || '';
  const templateFilename = uploadedSelect.value || undefined;
  setStatus('Generating...', true, true);
  try {
    const res = await fetch('/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, templateFilename })
    });
    await handleDownloadResponse(res, name);
    setStatus('Craft generated and downloaded ✅', true, false);
  } catch (err) {
    setStatus('Generation failed: ' + (err.message||err), false, false);
  }
});

// Reusable download handler that handles Content-Disposition filename and fallback to open in new tab
async function handleDownloadResponse(res, fallbackName){
  if (!res.ok){ let err = null; try { err = await res.json(); } catch(e){ } throw new Error((err&&err.error) || res.statusText || 'Server error'); }
  const blob = await res.blob();
  if (!blob || blob.size === 0) throw new Error('Empty file from server');
  // get filename from header
  let filename = fallbackName.replace(/[^a-z0-9-_]/gi,'_') + '.craft';
  const cd = res.headers.get('Content-Disposition');
  if (cd){ const m = cd.match(/filename\*?=([^;]+)/); if (m){ filename = m[1].trim().replace(/"/g,''); } }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display='none'; document.body.appendChild(a);
  try { a.click(); } catch(e){
    // fallback: open in new tab
    window.open(url, '_blank');
  } finally { a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 15000); }
}

// AI generate and download
const aiGenerateBtn = await $('aiGenerateBtn');
aiGenerateBtn.addEventListener('click', async ()=>{
  const name = craftName.value || 'AICraft';
  const desc = description.value || '';
  const templateFilename = uploadedSelect.value || undefined;
  setStatus('AI generating... (this may take a few seconds)', true, true);
  try {
    const res = await fetch('/ai-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, templateFilename, model: modelInput.value || undefined })
    });
    await handleDownloadResponse(res, name);
    setStatus('AI-generated craft downloaded ✅', true, false);
  } catch (err) {
    setStatus('AI generation failed: ' + (err.message||err), false, false);
  }
});

// AI preview
const aiPreviewBtn = await $('aiPreviewBtn');
const previewModal = await $('previewModal');
const previewXml = await $('previewXml');
const previewInfo = await $('previewInfo');
const previewRunTestsBtn = await $('previewRunTestsBtn');
const previewDownloadBtn = await $('previewDownloadBtn');
const previewApplyBtn = await $('previewApplyBtn');
const previewCloseBtn = await $('previewCloseBtn');
const previewTestResults = await $('previewTestResults');

aiPreviewBtn.addEventListener('click', async ()=>{
  const name = craftName.value || 'AICraft';
  const desc = description.value || '';
  const templateFilename = uploadedSelect.value || undefined;
  setStatus('AI preview generating...', true, true);
  previewInfo.textContent = '';
  previewXml.value = '';
  previewModal.style.display = 'flex';

  try {
    const res = await fetch('/ai-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, templateFilename, model: modelInput.value || undefined })
    });
    if (!res.ok){ const err = await res.json().catch(()=>null); throw new Error((err&&err.error)||res.statusText); }
    const data = await res.json();
    previewXml.value = data.xml || '';
    if (data.valid) {
      previewInfo.style.color = '#080';
      previewInfo.textContent = 'Valid XML — ready to download.';
    } else {
      previewInfo.style.color = '#900';
      previewInfo.textContent = 'Invalid XML: ' + JSON.stringify(data.errors);
    }
    setStatus('AI preview ready', true, false);
  } catch (err) {
    setStatus('AI preview failed: ' + (err.message||err), false, false);
    previewModal.style.display = 'none';
  }
});

previewDownloadBtn.addEventListener('click', ()=>{
  const content = previewXml.value || '';
  if (!content) { setStatus('Nothing to download', false); return; }
  const filename = (craftName.value || 'preview').replace(/[^a-z0-9-_]/gi,'_') + '.craft';
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display='none'; document.body.appendChild(a);
  try { a.click(); setStatus('Preview downloaded', true); }
  catch(e){ window.open(url, '_blank'); setStatus('Download opened in new tab - long-press to save on mobile', true); }
  finally { a.remove(); setTimeout(()=>URL.revokeObjectURL(url),15000); }
});

previewRunTestsBtn.addEventListener('click', async ()=>{
  const content = previewXml.value || '';
  if (!content){ setStatus('Nothing to test', false); return; }
  setStatus('Running tests...', true, true);
  previewTestResults.textContent = '';
  try{
    const res = await fetch('/ai-test', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ xml: content }) });
    const data = await res.json();
    if (!res.ok){ setStatus('Test failed: ' + (data?.error||res.statusText), false, false); previewTestResults.textContent = 'Error: ' + (data?.error||res.statusText); return; }
    // show results
    previewTestResults.innerHTML = '';
    if (data.errors && data.errors.length) previewTestResults.innerHTML += `<div style="color:#b00">Errors: ${escapeHtml(JSON.stringify(data.errors))}</div>`;
    if (data.warnings && data.warnings.length) previewTestResults.innerHTML += `<div style="color:#e68a00">Warnings: ${escapeHtml(JSON.stringify(data.warnings))}</div>`;
    if (data.ok) previewTestResults.innerHTML += `<div style="color:#080">All checks passed ✅</div>`;
    setStatus('Tests completed', true, false);
  }catch(e){ setStatus('Test failed', false, false); previewTestResults.textContent = 'Test error: ' + (e.message||e); }
});

previewApplyBtn.addEventListener('click', ()=>{
  // Accept and download
  previewDownloadBtn.click();
  previewModal.style.display = 'none';
});

previewCloseBtn.addEventListener('click', ()=>{ previewModal.style.display = 'none'; });

// History / Logs UI
const bottomPanel = await $('bottomPanel');
const historyArea = await $('historyArea');
const logsArea = await $('logsArea');
const toggleHistoryBtn = await $('toggleHistoryBtn');
const toggleLogsBtn = await $('toggleLogsBtn');
const closePanelBtn = await $('closePanelBtn');

// Chat UI elements
const chatArea = await $('chatArea');
const chatInput = await $('chatInput');
const chatSend = await $('chatSend');
const chatAction = await $('chatAction');
const modelInput = await $('modelInput');
const autoSpeakToggle = await $('autoSpeak');
const fullscreenBtn = await $('fullscreenBtn');
const chatPanel = await $('chatPanel');
const presetQuick = await $('presetQuick');
const presetDetailed = await $('presetDetailed');
const presetTest = await $('presetTest');

fullscreenBtn.addEventListener('click', ()=>{
  if (chatPanel.classList.contains('chat-fullscreen')){
    chatPanel.classList.remove('chat-fullscreen');
    fullscreenBtn.textContent = 'Fullscreen';
  } else {
    chatPanel.classList.add('chat-fullscreen');
    fullscreenBtn.textContent = 'Exit';
  }
});

// Text-to-speech helper
function speakText(text){
  try{
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g,''));
    // prefer Ukrainian or English if available
    const voices = window.speechSynthesis.getVoices();
    let voice = voices.find(v => v.lang && v.lang.startsWith('uk')) || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
    if (voice) utter.voice = voice;
    utter.rate = 1.0; utter.pitch = 1.0;
    window.speechSynthesis.speak(utter);
  }catch(e){ console.warn('TTS failed', e); }
}

function renderChatMessage(who, text){
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom='10px';
  if (who === 'user'){
    wrapper.style.textAlign='right';
    wrapper.innerHTML = `<div style="display:inline-block; background:#007bff; color:#fff; padding:10px 12px; border-radius:12px; max-width:86%">${escapeHtml(text)}</div>`;
  } else if (who === 'ai'){
    wrapper.style.textAlign='left';
    const id = 'ai-msg-'+Date.now()+Math.random().toString(36).slice(2,7);
    wrapper.innerHTML = `<div style="display:inline-block; background:#fff; border:1px solid #e6e6e6; padding:10px 12px; border-radius:12px; max-width:86%"><pre id="${id}" style="white-space:pre-wrap;font-family:monospace;margin:0">${escapeHtml(text)}</pre><div style="margin-top:6px; text-align:right"><button class="btn" data-speak-target="${id}">🔊 Speak</button></div></div>`;
    // attach speak handler
    setTimeout(()=>{ const btn = wrapper.querySelector('button[data-speak-target]'); if (btn){ btn.addEventListener('click', ()=>{ const t = document.getElementById(btn.getAttribute('data-speak-target')).innerText; speakText(t); }); if (autoSpeakToggle.checked) { const t = document.getElementById(btn.getAttribute('data-speak-target')).innerText; speakText(t); } } }, 20);
  } else if (who === 'error'){
    wrapper.style.textAlign='left';
    wrapper.innerHTML = `<div style="display:inline-block; background:#fee; border:1px solid #f5c6cb; padding:10px 12px; border-radius:12px; max-width:86%; color:#b00">${escapeHtml(text)}</div>`;
  }
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
}

chatSend.addEventListener('click', async ()=>{
  const text = (chatInput.value || '').trim();
  if (!text) return;

  // prevent double send by disabling
  chatSend.disabled = true; chatInput.disabled = true; setStatus('Sending...', true, true);

  // Add preset to history if a preset was used (we push the text as user)
  // Implementation continues below

  const action = chatAction.value || 'preview';
  // push user bubble
  renderChatMessage('user', text);
  pushLocalHistory('user', action, text);
  chatInput.value = '';
  // perform action
  if (action === 'preview'){
    setStatus('AI preview generating...', true, true);
    try{
      const res = await fetch('/ai-preview', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: craftName.value || 'AICraft', description: text, templateFilename: uploadedSelect.value || undefined, model: modelInput.value || undefined }) });
      if (!res.ok){ const err = await res.json().catch(()=>null); throw new Error((err&&err.error)||res.statusText); }
      const data = await res.json();
      if (data.xml) renderChatMessage('ai', data.xml);
      else renderChatMessage('ai', '(no xml)');
      pushLocalHistory('ai', 'preview', data.xml||'(no xml)');
      setStatus('AI preview ready', true, false);
      openPanel();
    }catch(e){ renderChatMessage('error', e.message||String(e)); pushLocalHistory('error','preview', e.message||String(e)); setStatus('AI preview failed: '+(e.message||e), false, false); openPanel(); }
  } else if (action === 'generate'){
    setStatus('AI generating craft...', true, true);
    try{
      const res = await fetch('/ai-generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: craftName.value || 'AICraft', description: text, templateFilename: uploadedSelect.value || undefined, model: modelInput.value || undefined }) });
      if (!res.ok){ const err = await res.json().catch(()=>null); throw new Error((err&&err.error)||res.statusText); }
      const blob = await res.blob();
      const textResp = await blob.text();
      renderChatMessage('ai', textResp || '(no content)');
      pushLocalHistory('ai','generate', textResp || '(no content)');
      // download
      const filename = (craftName.value || 'AICraft').replace(/[^a-z0-9-_]/gi,'_') + '.craft';
      const url = URL.createObjectURL(new Blob([textResp], { type:'application/octet-stream' }));
      const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display='none'; document.body.appendChild(a);
      try{ a.click(); } catch(e){ window.open(url,'_blank'); }
      finally{ a.remove(); setTimeout(()=>URL.revokeObjectURL(url),15000); }
      setStatus('AI-generated craft downloaded ✅', true, false);
      openPanel();
    }catch(e){ renderChatMessage('error', e.message||String(e)); pushLocalHistory('error','generate', e.message||String(e)); setStatus('AI generation failed: '+(e.message||e), false, false); openPanel(); }
  }
  // re-enable inputs
  chatSend.disabled = false; chatInput.disabled = false; setStatus('', true, false);
});

// send on Enter
chatInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); chatSend.click(); } });

// Preset button handlers
presetQuick.addEventListener('click', ()=>{ chatInput.value = "Створи компактну швидку ракету для атмосфери: максимальна швидкість ~Mach 2.5, головний двигун на LOX/CH4, прості шасі, зроби її стійкою і маленькою."; chatInput.focus(); });
presetDetailed.addEventListener('click', ()=>{ chatInput.value = `Мета: "гіперзвуковий літак для тестів". Параметри: макс Mach 3, діапазон 600 км, тип LOX/CH4, має колесні шасі. Обмеження: ширина < 6 м. Вивід: тільки .craft XML. Ім'я: HypersonicTest.`; chatInput.focus(); });
presetTest.addEventListener('click', ()=>{ chatInput.value = `Опиши: "ракета-переносник, вивантаження вантажу". Прості правила: - додай gyroscope; - перевір CoM; - fuelType=LOX/CH4. Поверни тільки валідний .craft XML.`; chatInput.focus(); });

function renderHistoryItem(item){
  const div = document.createElement('div');
  div.style.padding='8px'; div.style.borderBottom='1px solid #f1f1f1';
  if (item.role === 'user') {
    div.innerHTML = `<div style="font-size:0.9em;color:#333"><strong>You</strong> <span style="color:#888;font-size:0.8em;margin-left:8px">${new Date(item.time).toLocaleString()}</span></div><div style="margin-top:6px">${escapeHtml(item.text)}</div>`;
  } else if (item.role === 'ai') {
    div.innerHTML = `<div style="font-size:0.9em;color:#333"><strong>AI</strong> <span style="color:#888;font-size:0.8em;margin-left:8px">${new Date(item.time).toLocaleString()}</span></div><pre style="white-space:pre-wrap;margin-top:6px;font-family:monospace">${escapeHtml(item.text)}</pre>`;
  } else if (item.role === 'error') {
    div.innerHTML = `<div style="font-size:0.9em;color:#b00"><strong>Error</strong> <span style="color:#888;font-size:0.8em;margin-left:8px">${new Date(item.time).toLocaleString()}</span></div><div style="margin-top:6px;color:#b00">${escapeHtml(item.text)}</div>`;
  }
  return div;
}

function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function refreshHistory(){
  try{
    const res = await fetch('/history');
    const data = await res.json();
    historyArea.innerHTML = '';
    (data.history||[]).slice().reverse().forEach(it => { historyArea.appendChild(renderHistoryItem(it)); });
    historyArea.scrollTop = historyArea.scrollHeight;
  }catch(e){ historyArea.textContent = 'Failed to load history'; }
}

async function refreshServerLogs(){
  try{
    const res = await fetch('/server-logs');
    const data = await res.json();
    logsArea.textContent = data.logs || '';
    logsArea.scrollTop = logsArea.scrollHeight;
  }catch(e){ logsArea.textContent = 'Failed to load server logs'; }
}

toggleHistoryBtn.addEventListener('click', ()=>{ historyArea.style.display='block'; logsArea.style.display='none'; refreshHistory(); });
toggleLogsBtn.addEventListener('click', ()=>{ historyArea.style.display='none'; logsArea.style.display='block'; refreshServerLogs(); });
closePanelBtn.addEventListener('click', ()=>{ bottomPanel.style.display='none'; });

// Append history entries during actions
function pushLocalHistory(role, type, text){
  const entry = { role, type, text, time: new Date().toISOString() };
  // show immediately
  historyArea.appendChild(renderHistoryItem(entry));
  historyArea.scrollTop = historyArea.scrollHeight;
}

// Update AI actions to push to UI history
// Wrap existing call sites: before calling /ai-preview or /ai-generate, push user entry; on response push ai entry; on error push error entry.

// wrap preview handler
const originalAiPreviewHandler = aiPreviewBtn.onclick;

// Note: we updated the click handler already above; so we will modify the existing function inline by adding UI pushes
(function patchPreview(){
  const old = aiPreviewBtn.onclick; // may be null
  aiPreviewBtn.onclick = null; // ensure we don't double attach
  aiPreviewBtn.addEventListener('click', async ()=>{
    const name = craftName.value || 'AICraft';
    const desc = description.value || '';
    const templateFilename = uploadedSelect.value || undefined;
    setStatus('AI preview generating...', true, true);

    // local history push
    pushLocalHistory('user', 'preview', desc || '(no description)');

    previewInfo.textContent = '';
    previewXml.value = '';
    previewModal.style.display = 'flex';

    try {
      const res = await fetch('/ai-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc, templateFilename })
      });
      if (!res.ok){ const err = await res.json().catch(()=>null); throw new Error((err&&err.error)||res.statusText); }
      const data = await res.json();
      previewXml.value = data.xml || '';
      if (data.valid) {
        previewInfo.style.color = '#080';
        previewInfo.textContent = 'Valid XML — ready to download.';
      } else {
        previewInfo.style.color = '#900';
        previewInfo.textContent = 'Invalid XML: ' + JSON.stringify(data.errors);
      }
      setStatus('AI preview ready', true, false);

      // push AI response to UI history
      pushLocalHistory('ai', 'preview', data.xml || '(no xml)');
    } catch (err) {
      setStatus('AI preview failed: ' + (err.message||err), false, false);
      pushLocalHistory('error', 'preview', err.message || 'Preview failed');
      previewModal.style.display = 'none';
    }
  });
})();

// wrap AI generate handler similarly
const oldAIGenerate = aiGenerateBtn.onclick;
aiGenerateBtn.onclick = null;
aiGenerateBtn.addEventListener('click', async ()=>{
  const name = craftName.value || 'AICraft';
  const desc = description.value || '';
  const templateFilename = uploadedSelect.value || undefined;
  setStatus('AI generating... (this may take a few seconds)', true, true);

  pushLocalHistory('user', 'generate', desc || '(no description)');

  try {
    const res = await fetch('/ai-generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, templateFilename })
    });
    // read response text (copy for history) and also prepare blob
    if (!res.ok){ const err = await res.json().catch(()=>null); throw new Error((err&&err.error)||res.statusText); }
    const blob = await res.blob();
    const text = await blob.text();

    // push AI response as text (may be XML)
    pushLocalHistory('ai', 'generate', text || '(no content)');

    // then create blob download
    const filename = name.replace(/[^a-z0-9-_]/gi,'_') + '.craft';
    const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display='none'; document.body.appendChild(a);
    try { a.click(); } catch(e){ window.open(url, '_blank'); }
    finally { a.remove(); setTimeout(()=>URL.revokeObjectURL(url),15000); }

    setStatus('AI-generated craft downloaded ✅', true, false);
  } catch (err) {
    setStatus('AI generation failed: ' + (err.message||err), false, false);
    pushLocalHistory('error', 'generate', err.message || 'Generation failed');
  }
});

// auto-refresh server logs when logs tab visible
let logsInterval = null;
logsArea.addEventListener('mouseenter', ()=>{
  if (!logsInterval) logsInterval = setInterval(refreshServerLogs, 3000);
});
logsArea.addEventListener('mouseleave', ()=>{ if (logsInterval){ clearInterval(logsInterval); logsInterval = null; } });

// kickstart: hide panel by default
bottomPanel.style.display='none';

// show panel on toggle with a keyboard shortcut (Ctrl+J)
document.addEventListener('keydown', (e)=>{ if (e.ctrlKey && e.key.toLowerCase()==='j'){ bottomPanel.style.display = bottomPanel.style.display==='none' ? 'block' : 'none'; } });

// helper to open panel when actions occur
function openPanel(){ bottomPanel.style.display='block'; }

// adjust existing actions to open panel on start
generateBtn.addEventListener('click', ()=>{ openPanel(); });
aiGenerateBtn.addEventListener('click', ()=>{ openPanel(); });
aiPreviewBtn.addEventListener('click', ()=>{ openPanel(); });

refreshTemplates().catch(()=>{});
refreshHistory().catch(()=>{});

