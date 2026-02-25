# System Architecture

## Overview

insurai is a modern, full-stack application for Turkish insurance policy analysis. The architecture leverages a monolithic Node.js backend to serve and support a React frontend, augmented by the Supabase ecosystem for auth, storage, and database management. Heavy computation tasks such as AI extraction and OCR are offloaded to external provider APIs.

## Architecture Diagram

```mermaid
graph TD
    User([User / Browser])
    
    subgraph "Railway Deployment Boundary"
        Vite[React Frontend (Vite)]
        Express[Node.js Express API]
    end
    
    subgraph "Supabase Platform"
        Auth[Supabase Auth]
        DB[(PostgreSQL Database)]
        Storage[Blob Storage]
        Edge[Edge Functions]
        Cron[pg_cron Scheduler]
    end
    
    subgraph "External API Integrations"
        OpenAI[OpenAI API]
        Anthropic[Anthropic API]
        GoogleVision[Google Cloud Vision OCR]
        Sentry[Sentry Error Tracking]
        GA4[Google Analytics]
    end

    %% Client Interactions
    User -->|Serves App| Vite
    User -->|HTTPS /api/*| Express
    
    %% Supabase Interactions
    Vite -->|Client-side Auth JWT| Auth
    Vite -->|Direct RLS Data Access| DB
    Vite -->|Policy PDF Uploads| Storage
    Express -->|Admin DB Ops (Service Role)| DB

    %% External Systems
    Express -->|Extraction & Chat| OpenAI
    Express -->|Extraction & Chat| Anthropic
    Express -->|OCR Processing| GoogleVision
    
    %% Monitoring & Tracking
    Vite -.->|Client Errors| Sentry
    Express -.->|Server Errors| Sentry
    Vite -.->|Analytics Session| GA4

    %% Background Jobs
    Cron -.->|Triggers Daily| Edge
    Edge -.->|VAPID Push Notifications| User
```

## Request Lifecycle Mapping

### 1. Document Upload & Pre-Processing
1. **User** uploads a PDF policy securely via the **React Frontend**.
2. The frontend runs local `pdf.js` to extract raw text constraints natively in the browser.
3. If the document has low character density, it leverages the `/api/ai/ocr` endpoint on the **Node.js Express** backend to perform computer-vision-based text recovery using **Google Cloud Vision**.

### 2. AI Data Extraction
1. Once text is assembled, the frontend requests extraction via the `/api/ai/extract/*` endpoints. 
2. The **Express** API securely holds connection credentials and invokes the selected foundational model (e.g., **OpenAI** or **Anthropic**).
3. The response is shaped by predefined validation schemas (`Zod`) in the backend to ensure data cleanliness and validity before returning it to the user.

### 3. Database Persistence & Comparison
1. Validated, shaped policy JSON is securely written to the **PostgreSQL Database** living in **Supabase**, scoped strictly by Row Level Security (RLS) policies tied to the user's JWT from **Supabase Auth**.
2. Policy original PDF files are committed to **Supabase Storage**, associated tightly with their database records.

### 4. Background Automated Tasks
1. Nightly, the database-native **pg_cron Scheduler** triggers the `/notify-expiring` **Edge Function**.
2. The edge function safely evaluates expiring policies within the database and issues PWA Web Push Notifications directly back to the **User's** OS.
