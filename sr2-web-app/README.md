SR2 Craft Generator — minimal demo

This project is a small demo that shows how to:
- upload a .craft file (used as a template),
- generate a new .craft by replacing placeholders (NAME and DESCRIPTION),
- download the generated .craft and import it to SimpleRockets 2 on your phone.

How to run:
1. Install dependencies: `npm install`
2. Start: `npm start`
3. Open `http://localhost:3000` and use the UI to upload a template or generate a craft from the sample template.

Demo link (local): http://localhost:3000 — open in your browser while the server is running.

Temporary public demo (tunnel): https://curvy-actors-rhyme.loca.lt — available while the local tunnel session is active.

Troubleshooting downloads:
- If the browser does not automatically save the .craft file, try the **Preview AI** button and use **Download** from the preview modal (works better on mobile). If that still doesn't start, the preview modal can open the XML in a new tab where you can long-press (mobile) or right-click → Save as (desktop).

Notes:
- The current sample template is small and may not include all fields from real .craft files. Upload your real .craft file (Download from SimpleRockets site) and use it as a template for accurate generation.
- Next steps: integrate an AI backend (OpenAI) to accept natural language description and auto-fill craft components.

OpenAI integration (AI generation)

1. Set your OpenAI API key in `.env` (copy `.env.example` and set `OPENAI_API_KEY`).
2. Start the server: `npm install` then `npm start`.
3. Use the endpoint `POST /ai-generate` with JSON body `{ "description": "fast rocket with large fuel tanks", "name": "MyAIcraft", "templateFilename": "optional-uploaded.craft" }`.
4. The endpoint will return a generated `.craft` file (attachment) produced by the AI. The server now extracts the returned text and validates it as XML — if the AI returns anything other than a valid `<Craft>...</Craft>` document the request will fail with an error and details. Note: AI output may still need manual verification; always review the generated .craft before importing into the game.

CraftGen Chat:
- The UI now includes a chat-style assistant called **CraftGen Chat** (right column). Write a simple prompt and press **Send**. Choose **Preview** (recommended) to see AI XML output, or **Generate & Download** to create and download a .craft directly from the chat. Chat history and server logs are visible in the Activity panel (Ctrl+J).
- New features: **Fullscreen** chat (click Fullscreen in header), **Auto Speak** toggle to have AI responses read aloud using your browser's TTS, and a **Model** input to request a specific model (for example, `gpt-5.2`) — note: the server will pass the model name through to the OpenAI API, and the model will work only if your API account supports it. Be careful to keep your `OPENAI_API_KEY` secret and note that unsupported model names will produce API errors.

Presets and tests
- Use the Preset selector in the chat (Quick / Detailed / Validation) and Insert Preset to load a prompt into the chat input.
- Preview modal now has a **Run Tests** button which runs basic checks (CommandPod, FuelTank, Gyroscope, centerOfMass and well-formed XML). The endpoint is `POST /run-tests` and also available to the preview modal.

Preview feature:
- Use the 'Preview AI' button in the UI to see the AI-generated `.craft` XML before downloading. The preview shows validation status and allows editing the XML before downloading.

Security note: keep your OpenAI API key secret and do not commit it into source control.
