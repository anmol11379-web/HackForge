# HackForge

Settlement investigation tools for the HackForge hackathon.

## Main application

[`settlement-qa-agent`](settlement-qa-agent) is the canonical application for this repository. All new features, bug fixes, configuration changes, and UI work should be made there.

[`merged-settlement-agent`](merged-settlement-agent) is an older standalone FastAPI implementation retained for reference only. It is not part of the main development workflow.

## Primary application

```powershell
cd settlement-qa-agent\server
npm install
npm run dev
```

In another terminal:

```powershell
cd settlement-qa-agent\client
npm install
npm run dev
```

See [`settlement-qa-agent/README.md`](settlement-qa-agent/README.md) for configuration, API details, and tests.

## Repository hygiene

Generated dependencies, virtual environments, caches, build output, local environment files, and editor metadata are ignored by the root `.gitignore`.
