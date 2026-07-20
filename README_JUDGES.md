# SENTINEL — Hackathon Judges & Evaluators Guide

Thank you for evaluating **Sentinel (Anticipatory Action Decision Copilot)**!

## Package Contents

- `PATCH_NOTES.md`: Engineering notes for running the official ICPAC `ibf-thresholds-triggers` scientific pipeline under Windows.
- `run_full_pipeline.ps1`: PowerShell wrapper for the official pipeline, covering Copernicus SEAS5.1 ingestion through district-level probability generation.
- `/backend`: FastAPI orchestration service with Gemini 2.5 Flash decision engine and SQLite audit trail.
- `/frontend`: Responsive Leaflet.js and Tailwind CSS dashboard with map trigger visualization, role-tailored action briefs, action confirmation, and PDF exports.
- `sentinel-action-brief-Karenga.pdf`: Sample field-ready export for Karenga District, if included with the package.

## Quick Start / How to Run

1. **Backend**
   - Navigate to `/backend`.
   - Install dependencies: `pip install -r requirements.txt`.
   - Set `GEMINI_API_KEY=your_key_here` in `backend/.env`.
   - Launch the API: `uvicorn backend.main:app --reload`.
2. **Frontend**
   - From the project root, serve the dashboard: `python -m http.server 5500 -d frontend`.
   - Open `http://localhost:5500`.

## Included Scientific Inputs

The package includes the Karamoja district boundaries and the real district-average drought probabilities generated for the OND 2026 forecast. Sentinel reads these files dynamically: it does not use mocked district values.

## Evaluation Path

1. Start the API and dashboard.
2. Click **Karenga** on the map (18.1% drought probability, above the 15.2% activation trigger).
3. Generate role-specific briefs with explicit confidence and conditionality.
4. Confirm an action to inspect the accountability log.
5. Export the action brief to PDF.

> The Gemini API key is intentionally excluded from this submission package.
