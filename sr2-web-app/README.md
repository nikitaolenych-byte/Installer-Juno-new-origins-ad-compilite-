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

Notes:
- The current sample template is small and may not include all fields from real .craft files. Upload your real .craft file (Download from SimpleRockets site) and use it as a template for accurate generation.
- Next steps: integrate an AI backend (OpenAI) to accept natural language description and auto-fill craft components.

OpenAI integration (AI generation)

1. Set your OpenAI API key in `.env` (copy `.env.example` and set `OPENAI_API_KEY`).
2. Start the server: `npm install` then `npm start`.
3. Use the endpoint `POST /ai-generate` with JSON body `{ "description": "fast rocket with large fuel tanks", "name": "MyAIcraft", "templateFilename": "optional-uploaded.craft" }`.
4. The endpoint will return a generated `.craft` file (attachment) produced by the AI. The server now extracts the returned text and validates it as XML — if the AI returns anything other than a valid `<Craft>...</Craft>` document the request will fail with an error and details. Note: AI output may still need manual verification; always review the generated .craft before importing into the game.

Preview feature:
- Use the 'Preview AI' button in the UI to see the AI-generated `.craft` XML before downloading. The preview shows validation status and allows editing the XML before downloading.

Security note: keep your OpenAI API key secret and do not commit it into source control.
