async function $(id){ return document.getElementById(id) }

const uploadBtn = await $('uploadBtn');
const craftFile = await $('craftFile');
const status = await $('status');
const generateBtn = await $('generateBtn');
const craftName = await $('craftName');
const description = await $('description');
const uploadedSelect = await $('uploadedTemplates');

function setStatus(msg, ok=true){ status.textContent = msg; status.style.color = ok? '#222':'#b00'; }

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
  setStatus('Generating...');
  const res = await fetch('/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: desc, templateFilename })
  });
  if (!res.ok){ setStatus('Generation failed', false); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^a-z0-9-_]/gi,'_') + '.craft';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus('Craft generated and downloaded ✅');
});

// AI generate and download
const aiGenerateBtn = await $('aiGenerateBtn');
aiGenerateBtn.addEventListener('click', async ()=>{
  const name = craftName.value || 'AICraft';
  const desc = description.value || '';
  const templateFilename = uploadedSelect.value || undefined;
  setStatus('AI generating... (this may take a few seconds)');
  const res = await fetch('/ai-generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: desc, templateFilename })
  });
  if (!res.ok){ const err = await res.json().catch(()=>null); setStatus('AI generation failed: ' + (err?.error||res.statusText), false); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^a-z0-9-_]/gi,'_') + '.craft';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  setStatus('AI-generated craft downloaded ✅');
});

// AI preview
const aiPreviewBtn = await $('aiPreviewBtn');
const previewModal = await $('previewModal');
const previewXml = await $('previewXml');
const previewInfo = await $('previewInfo');
const previewDownloadBtn = await $('previewDownloadBtn');
const previewApplyBtn = await $('previewApplyBtn');
const previewCloseBtn = await $('previewCloseBtn');

aiPreviewBtn.addEventListener('click', async ()=>{
  const name = craftName.value || 'AICraft';
  const desc = description.value || '';
  const templateFilename = uploadedSelect.value || undefined;
  setStatus('AI preview generating...');
  previewInfo.textContent = '';
  previewXml.value = '';
  previewModal.style.display = 'flex';

  const res = await fetch('/ai-preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: desc, templateFilename })
  });
  if (!res.ok){ const err = await res.json().catch(()=>null); setStatus('AI preview failed: ' + (err?.error||res.statusText), false); previewModal.style.display = 'none'; return; }
  const data = await res.json();
  previewXml.value = data.xml || '';
  if (data.valid) {
    previewInfo.style.color = '#080';
    previewInfo.textContent = 'Valid XML — ready to download.';
  } else {
    previewInfo.style.color = '#900';
    previewInfo.textContent = 'Invalid XML: ' + JSON.stringify(data.errors);
  }
  setStatus('AI preview ready');
});

previewDownloadBtn.addEventListener('click', ()=>{
  const content = previewXml.value || '';
  const filename = (craftName.value || 'preview').replace(/[^a-z0-9-_]/gi,'_') + '.craft';
  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

previewApplyBtn.addEventListener('click', ()=>{
  // Accept and download
  previewDownloadBtn.click();
  previewModal.style.display = 'none';
});

previewCloseBtn.addEventListener('click', ()=>{ previewModal.style.display = 'none'; });

// init
refreshTemplates().catch(()=>{});
