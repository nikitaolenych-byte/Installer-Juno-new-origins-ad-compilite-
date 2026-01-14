const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { XMLValidator } = require('fast-xml-parser');

// Initialize OpenAI client only if API key is present to allow running without AI key
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for uploads
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Upload endpoint: accept a .craft template file
app.post('/upload', upload.single('craftFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  return res.json({ ok: true, filename: req.file.filename, original: req.file.originalname });
});

// List uploaded templates
app.get('/templates', (req, res) => {
  const dir = path.join(__dirname, 'uploads');
  fs.readdir(dir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Unable to list templates' });
    const craftFiles = files.filter(f => f.endsWith('.craft'));
    res.json({ templates: craftFiles });
  });
});

// Generate a craft file from a template (uploaded or builtin sample)
// Expects JSON: { name, description, templateFilename? }
app.post('/generate', (req, res) => {
  const { name = 'GeneratedCraft', description = '', templateFilename } = req.body;
  const templatesDir = path.join(__dirname, 'uploads');
  const defaultTemplate = path.join(__dirname, 'templates', 'sample.craft');

  const readTemplate = (p) => fs.readFileSync(p, 'utf8');

  let templateData;
  try {
    if (templateFilename) {
      const p = path.join(templatesDir, templateFilename);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'Template not found' });
      templateData = readTemplate(p);
    } else {
      templateData = readTemplate(defaultTemplate);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read template', details: e.message });
  }

  // Simple placeholder replacement
  const filled = templateData
    .replace(/\{\{NAME\}\}/g, name)
    .replace(/\{\{DESCRIPTION\}\}/g, description);

  const filename = `${name.replace(/[^a-z0-9-_]/gi, '_')}.craft`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  return res.send(filled);
});

// AI generate: call OpenAI to transform template according to description
app.post('/ai-generate', async (req, res) => {
  const { description = '', templateFilename, name = 'AI_Craft' } = req.body;
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY.' });
  const templatesDir = path.join(__dirname, 'uploads');
  const defaultTemplate = path.join(__dirname, 'templates', 'sample.craft');
  const readTemplate = (p) => fs.readFileSync(p, 'utf8');

  let templateData;
  try {
    if (templateFilename) {
      const p = path.join(templatesDir, templateFilename);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'Template not found' });
      templateData = readTemplate(p);
    } else {
      templateData = readTemplate(defaultTemplate);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read template', details: e.message });
  }

  // Strong system prompt: force only XML output with no explanations or markdown
  const system = 'You are a strict assistant that edits SimpleRockets 2 .craft XML. ONLY output a single valid XML document for the .craft file and nothing else. Do NOT include explanations, backticks, or markdown. Ensure the root element is <Craft> and close all tags.';

  const userPrompt = `User description: "${description}"\n\nTemplate XML (do not output the template again unchanged unless you modify it):\n${templateData}\n\nModify the template so that the craft matches the user description where reasonable. Replace placeholders {{NAME}} and {{DESCRIPTION}} with the provided name and description. Output only the full XML document (a single valid .craft XML) and nothing else.`;

  try {
    const modelToUse = req.body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.2
    });

    const aiText = completion.choices?.[0]?.message?.content;
    if (!aiText) return res.status(500).json({ error: 'Empty response from AI' });

    // Extract XML (try to find <?xml...?> and the <Craft>...</Craft> block)
    const xmlMatch = aiText.match(/(<\?xml[\s\S]*?\?>)?[\s\S]*?<Craft[\s\S]*?<\/Craft>/i);
    if (!xmlMatch) return res.status(500).json({ error: 'AI did not return a Craft XML document' });

    let xml = xmlMatch[0];
    // Replace placeholders if still present
    xml = xml.replace(/\{\{NAME\}\}/g, name).replace(/\{\{DESCRIPTION\}\}/g, description);

    // Validate XML
    const valid = XMLValidator.validate(xml);
    if (valid !== true) return res.status(500).json({ error: 'AI returned invalid XML', details: valid });

    const filename = `${name.replace(/[^a-z0-9-_]/gi, '_')}.craft`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(xml);
  } catch (e) {
    return res.status(500).json({ error: 'AI generation failed', details: e.message });
  }
});

// In-memory AI history (for UI logs) - small circular buffer
const AI_HISTORY_LIMIT = 200;
const aiHistory = [];
function addHistoryEntry(entry){
  // entry: { role: 'user'|'ai'|'system'|'error', type: 'preview'|'generate', text, time }
  aiHistory.push(Object.assign({ time: new Date().toISOString() }, entry));
  if (aiHistory.length > AI_HISTORY_LIMIT) aiHistory.shift();
}

// AI preview: return XML and validation info without forcing a download
app.post('/ai-preview', async (req, res) => {
  const { description = '', templateFilename, name = 'AI_Craft' } = req.body;
  addHistoryEntry({ role: 'user', type: 'preview', text: description });

  const templatesDir = path.join(__dirname, 'uploads');
  const defaultTemplate = path.join(__dirname, 'templates', 'sample.craft');
  const readTemplate = (p) => fs.readFileSync(p, 'utf8');

  let templateData;
  try {
    if (templateFilename) {
      const p = path.join(templatesDir, templateFilename);
      if (!fs.existsSync(p)) return res.status(404).json({ error: 'Template not found' });
      templateData = readTemplate(p);
    } else {
      templateData = readTemplate(defaultTemplate);
    }
  } catch (e) {
    addHistoryEntry({ role: 'error', type: 'preview', text: 'Failed to read template: ' + e.message });
    return res.status(500).json({ error: 'Failed to read template', details: e.message });
  }

  const system = 'You are a strict assistant that edits SimpleRockets 2 .craft XML. ONLY output a single valid XML document for the .craft file and nothing else. Do NOT include explanations, backticks, or markdown. Ensure the root element is <Craft> and close all tags.';

  const userPrompt = `User description: "${description}"\n\nTemplate XML (do not output the template again unchanged unless you modify it):\n${templateData}\n\nModify the template so that the craft matches the user description where reasonable. Replace placeholders {{NAME}} and {{DESCRIPTION}} with the provided name and description. Output only the full XML document (a single valid .craft XML) and nothing else.`;

  try {
    if (!openai) return res.status(500).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY.' });
    const modelToUse = req.body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const completion = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.2
    });

    const aiText = completion.choices?.[0]?.message?.content;
    if (!aiText) { addHistoryEntry({ role: 'error', type: 'preview', text: 'Empty response from AI' }); return res.status(500).json({ error: 'Empty response from AI' }); }

    const xmlMatch = aiText.match(/(<\?xml[\s\S]*?\?>)?[\s\S]*?<Craft[\s\S]*?<\/Craft>/i);
    if (!xmlMatch) { addHistoryEntry({ role: 'error', type: 'preview', text: 'AI did not return Craft XML' }); return res.status(500).json({ error: 'AI did not return a Craft XML document' }); }

    let xml = xmlMatch[0];
    xml = xml.replace(/\{\{NAME\}\}/g, name).replace(/\{\{DESCRIPTION\}\}/g, description);

    const valid = XMLValidator.validate(xml);

    addHistoryEntry({ role: 'ai', type: 'preview', text: xml });

    if (valid !== true) {
      return res.json({ xml, valid: false, errors: valid });
    }

    return res.json({ xml, valid: true });
  } catch (e) {
    addHistoryEntry({ role: 'error', type: 'preview', text: 'AI preview failed: ' + e.message });
    return res.status(500).json({ error: 'AI preview failed', details: e.message });
  }
});

// Endpoint to fetch in-memory AI history
app.get('/history', (req, res) => {
  res.json({ history: aiHistory });
});

// Run simple tests on a .craft XML: check for FuelTanks, Gyroscope, centerOfMass, fuelLine
app.post('/ai-test', (req, res) => {
  const { xml } = req.body;
  if (!xml) return res.status(400).json({ error: 'No XML provided' });
  try {
    // Try to parse XML
    const parser = require('fast-xml-parser');
    const parsed = parser.parse(xml, { ignoreAttributes:false, attributeNamePrefix: '' });
    if (!parsed || !parsed.Craft) return res.status(400).json({ error: 'Invalid Craft XML' });
    const assembly = parsed.Craft.Assembly || parsed.Craft.assembly || {};
    const parts = assembly.Parts && assembly.Parts.Part ? assembly.Parts.Part : [];
    const partsArray = Array.isArray(parts) ? parts : [parts];

    const warnings = [];
    const errors = [];

    // check fuel tanks
    const fuelTanks = partsArray.filter(p => {
      return p.FuelTank || (p.FuelTank === '') || (p['FuelTank'] !== undefined);
    });
    if (fuelTanks.length === 0) warnings.push('No FuelTank parts found — craft may have no fuel.');

    // check gyroscope
    const gyros = partsArray.filter(p => p.Gyroscope || p.Gyroscope !== undefined);
    if (gyros.length === 0) warnings.push('No Gyroscope found — craft may be unstable during flight.');

    // center of mass checks (search for Config centerOfMass)
    const comParts = partsArray.filter(p => p.Config && p.Config.centerOfMass);
    if (comParts.length === 0) warnings.push('No centerOfMass entries found in parts; verify CoM position in craft.');

    // fuelLine checks
    const fuelLineParts = partsArray.filter(p => p.Config && p.Config.fuelLine === 'true');
    if (fuelLineParts.length === 0) warnings.push('No fuelLine=true parts detected — check fuel routing.');

    // Basic pass criteria: no errors, and at least one fuel tank
    const ok = errors.length === 0;
    addHistoryEntry({ role: 'system', type: 'test', text: `Test run: ${warnings.length} warnings, ${errors.length} errors` });
    return res.json({ ok, warnings, errors });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to parse XML', details: e.message });
  }
});

// Endpoint to fetch server logs (tail)
app.get('/server-logs', (req, res) => {
  const logPath = '/tmp/sr2-server.log';
  if (!fs.existsSync(logPath)) return res.json({ logs: '' });
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    const lines = raw.split('\n');
    const last = lines.slice(-200).join('\n');
    res.json({ logs: last });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read server logs' });
  }
});


// Download uploaded template
app.get('/download/:file', (req, res) => {
  const file = req.params.file;
  const p = path.join(__dirname, 'uploads', file);
  if (!fs.existsSync(p)) return res.status(404).send('Not found');
  res.download(p);
});

app.listen(PORT, () => console.log(`SR2 Craft Generator running at http://localhost:${PORT}`));
