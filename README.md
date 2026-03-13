# Naya Overleaf

A better version of Overleaf with enhanced features and performance.

## Project Overview

Naya Overleaf is a modern LaTeX editor with real-time collaboration, enhanced compilation, and enterprise-ready features. This project aims to improve upon the original Overleaf with better performance, security, and scalability.

## Features

### Phase 1 (Completed)
- **CodeMirror 6 LaTeX Editor** with syntax highlighting, line numbers, and bracket matching
- **Real-time Collaboration** using ShareDB with operational transformation
- **PDF Preview** with PDF.js integration, zoom controls, and navigation
- **User Authentication** via Keycloak (with dev mode fallback)
- **Project Management** - create, edit, delete projects
- **Document Management** - multiple .tex files per project
- **Compilation Queue** - RabbitMQ-based job queue for LaTeX compilation

### Phase 2 (In Progress)
- Docker image optimization for TeX Live
- Redis caching for compilation results
- Security hardening with gVisor

## Implementation Roadmap

### Phase 1: Core Editor (8-12 Weeks)
- Setup CodeMirror 6 with LaTeX mode
- Implement ShareDB operational transformation
- Basic PDF preview with PDF.js
- User auth via Keycloak

### Phase 2: Compilation Stack (6-8 Weeks)
- Docker image optimization for TeX Live
- RabbitMQ job queue implementation
- Security hardening with gVisor
- Artifact caching with Redis

### Phase 3: Collaboration Features (10-12 Weeks)
- Track Changes with diff-match-patch
- Comments system with WebSocket sync
- Template gallery implementation
- Git integration via JGit

### Phase 4: Enterprise Scaling (Ongoing)
- Kubernetes cluster deployment
- Multi-region MongoDB sharding
- SOC 2 compliance controls
- CI/CD pipeline automation

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- MongoDB
- Redis (optional, for caching)
- RabbitMQ (optional, for compilation queue)
- Docker (for LaTeX compilation)

### Quick Start (Development Mode)

1. Clone the repository
   ```
   git clone https://github.com/yourusername/naya-overleaf.git
   cd naya-overleaf
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create environment file
   ```
   cp .env.example .env
   ```
   
   For development without Keycloak, ensure `SKIP_KEYCLOAK=true` is set.

4. Start MongoDB (if not running)
   ```
   mongod --dbpath ./data/db
   ```

5. Build the client bundle
   ```
   npm run build
   ```

6. Start the development server
   ```
   npm run dev
   ```

7. Open http://localhost:3000 in your browser

### Production Setup

For production, you'll need to:

1. Set up Keycloak for authentication
2. Configure Redis for session storage and caching
3. Set up RabbitMQ for compilation queue
4. Build the TeX Live Docker image:
   ```
   npm run build-docker
   ```

### Running Tests

```
npm test
```

## Project Structure

```
├── src/
│   ├── client/           # Frontend code
│   │   ├── components/   # React components
│   │   ├── editor/       # CodeMirror integration
│   │   ├── pdf/          # PDF.js integration
│   │   └── styles/       # CSS styles
│   ├── server/           # Backend code
│   │   ├── api/          # REST API endpoints
│   │   ├── auth/         # Authentication with Keycloak
│   │   ├── compiler/     # LaTeX compilation service
│   │   ├── db/           # Database models and connections
│   │   ├── realtime/     # ShareDB and WebSocket handlers
│   │   └── utils/        # Utility functions
│   └── shared/           # Shared code between client and server
├── docker/               # Docker configurations
│   ├── texlive/          # TeX Live Docker image
│   └── gvisor/           # gVisor security configurations
├── kubernetes/           # Kubernetes deployment files
├── tests/                # Test files
└── scripts/              # Utility scripts
```

## License

MIT