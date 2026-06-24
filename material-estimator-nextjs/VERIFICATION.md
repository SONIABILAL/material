# Verification

- `npm run build` — passed with Next.js 16.2.9
- `npm run lint` — passed
- PDF rendering smoke test — passed against a dense one-page architectural PDF using `pdfjs-dist` + `@napi-rs/canvas`

The OpenAI extraction calls were not executed during packaging because no API key is embedded in the project.
