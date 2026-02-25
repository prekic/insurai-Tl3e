# Use Railway Nixpacks for Deployment

* Status: accepted
* Deciders: Erdem
* Date: 2026-02-24

## Context and Problem Statement

As a single-developer project prioritizing speed, we needed an infrastructure provider capable of securely hosting a monolithic full-stack Node.js (Express + Vite/React) application. We need built-in CI/CD integration, flexible environment variable management, and automated builds that don't distract from feature work.

## Decision Drivers

* Rapid iteration speed for a solo developer.
* Low barrier to entry and minimal infrastructure configuration (No manual Dockerfiles).
* Zero downtime automated deployments tied to GitHub branches.
* Transparent and manageable costs for a personal project.

## Considered Options

* **Railway with Nixpacks**
* **Vercel** 
* **Render**
* **Self-hosted AWS EC2/ECS or DigitalOcean Droplet**

## Decision Outcome

Chosen option: "**Railway with Nixpacks**", because it natively builds our full-stack Express and React app with zero manual configuration. It manages our build (`npm run build && npm run build:server`) and start steps gracefully using Nixpacks, provides a clear environment variable interface, and integrates seamlessly with our GitHub Actions CI pipeline for production deployments.

### Positive Consequences

* No Dockerfile maintenance required; Nixpacks automatically detects our Node 20+ requirements via `package.json`.
* Seamless deployments on `main` branch merges.
* Easy environment variable injection at runtime.

### Negative Consequences

* Minor vendor lock-in to Railway's deployment ecosystem, though standard Node.js scripts remain easily portable.
* We have less granular control over the build container compared to writing a custom Dockerfile.
