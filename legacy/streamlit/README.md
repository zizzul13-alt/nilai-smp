# Legacy Streamlit application

This directory preserves the pre-R3 Streamlit implementation exactly as migration evidence and historical reference.

Status: **LEGACY / NOT TARGET ARCHITECTURE**.

- `app.py` and `requirements.txt` were moved from repository root without semantic conversion.
- Do not extend this code with new R3 product domains.
- Do not use its table shapes or shortcuts to redefine frozen R1/R2 semantics.
- Legacy data migration is deferred until the canonical R3 model is implemented and stabilized.

To inspect or run the historical app, use its historical Python dependencies and Streamlit secrets contract. This path is intentionally separate from the React application.
