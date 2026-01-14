const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { XMLValidator } = require('fast-xml-parser');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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

// AI preview: return XML and validation info without forcing a download
app.post('/ai-preview', async (req, res) => {
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

  const system = 'You are a strict assistant that edits SimpleRockets 2 .craft XML. ONLY output a single valid XML document for the .craft file and nothing else. Do NOT include explanations, backticks, or markdown. Ensure the root element is <Craft> and close all tags.';

  const userPrompt = `User description: "${description}"\n\nTemplate XML (do not output the template again unchanged unless you modify it):\n${templateData}\n\nModify the template so that the craft matches the user description where reasonable. Replace placeholders {{NAME}} and {{DESCRIPTION}} with the provided name and description. Output only the full XML document (a single valid .craft XML) and nothing else.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.2
    });

    const aiText = completion.choices?.[0]?.message?.content;
    if (!aiText) return res.status(500).json({ error: 'Empty response from AI' });

    const xmlMatch = aiText.match(/(<\?xml[\s\S]*?\?>)?[\s\S]*?<Craft[\s\S]*?<\/Craft>/i);
    if (!xmlMatch) return res.status(500).json({ error: 'AI did not return a Craft XML document' });

    let xml = xmlMatch[0];
    xml = xml.replace(/\{\{NAME\}\}/g, name).replace(/\{\{DESCRIPTION\}\}/g, description);

    const valid = XMLValidator.validate(xml);
    if (valid !== true) {
      return res.json({ xml, valid: false, errors: valid });
    }

    return res.json({ xml, valid: true });
  } catch (e) {
    return res.status(500).json({ error: 'AI preview failed', details: e.message });
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
