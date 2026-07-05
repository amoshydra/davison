# davison

A standalone music server that streams your local music library to Sonos speakers and serves it via WebDAV for tools like Music Assistant.

## Features

- **Sonos control** — discover Sonos speakers on your LAN, stream music directly to them
- **Mobile-first web UI** — browse your music library by folder, control playback, manage queues and playlists
- **WebDAV server** — expose your music library over WebDAV for Music Assistant, file managers, or any WebDAV client
- **Direct streaming** — HTTP range-request streaming with album art extraction
- **Zero configuration** — point it at your music folders and go
- **No cloud dependency** — everything runs on your local network

## Quick Start

### Prerequisites

- Node.js 22+ (or Docker)
- Music files on a local or mounted drive

### Via npx

```bash
npx davison --path /path/to/music
```

Open http://localhost:4534 in your browser.

### Via Docker

```bash
docker run -d \
  --name davison \
  --network host \
  -v /path/to/music:/music:ro \
  ghcr.io/your-username/davison \
  --path /music
```

> `--network host` is required for Sonos UPnP discovery to work.

### Via Docker Compose

```yaml
version: "3.8"
services:
  davison:
    image: ghcr.io/your-username/davison
    network_mode: host
    volumes:
      - /path/to/music:/music:ro
    command: ["--path", "/music"]
```

## Usage

### Command-line options

| Option | Description |
|--------|-------------|
| `-p, --path <paths...>` | One or more music directories (required) |
| `--port <number>` | Server port (default: 4534) |
| `--host <address>` | LAN address (auto-detected if omitted) |

### Web UI

| Tab | Description |
|-----|-------------|
| **Library** | Browse music by folder structure |
| **Queue** | View and manage the current playback queue |
| **Now Playing** | Full-screen player with album art, vinyl animation, swipe gestures |
| **Playlists** | Create, edit, and load playlists |
| **Settings** | Discover and select Sonos devices |

### WebDAV

The WebDAV server is available at `/webdav` (e.g., `http://<your-server-ip>:4534/webdav/`). It mirrors your music folder structure.

#### Authentication

Disabled by default. To require Basic authentication, set the `DAVISON_WEBDAV_USER` and `DAVISON_WEBDAV_PASS` environment variables:

```bash
DAVISON_WEBDAV_USER=davison DAVISON_WEBDAV_PASS="your-password" npx davison --path /music
```

Environment variables are recommended over CLI flags because they do not appear in process listings (`ps aux`) or shell history. When authentication is enabled, the server logs `WebDAV auth enabled for user "<username>"` on startup.

To use with Music Assistant:
1. Add a **WebDAV** provider
2. URL: `http://<your-server-ip>:4534/webdav/`
3. Username/Password: set them if you configured auth, leave blank otherwise

### Sonos

davison discovers Sonos speakers on your LAN automatically via SSDP multicast. Select a speaker from the **Settings** tab and start playing.

## Development

```bash
git clone https://github.com/your-username/davison.git
cd davison
pnpm install
pnpm run dev -- --path /path/to/music
```

The dev server hot-reloads on file changes.

## Architecture

```
                   ┌──────────────────────┐
                   │    Web Browser       │
                   │  (React + Vite)      │
                   └──────────┬───────────┘
                              │ HTTP (port 4534)
                   ┌──────────▼───────────┐
                   │   Express Server     │
                   │  ┌─────────────────┐ │
                   │  │ REST API (/api) │ │
                   │  │ Queue Manager   │ │
                   │  │ Sonos Controller│ │
                   │  │ Playlist Store  │ │
                   │  ├─────────────────┤ │
                   │  │ WebDAV (/webdav)│ │
                   │  │ (Nephele VFS)   │ │
                   │  └─────────────────┘ │
                   └──────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   ┌──────▼──────┐     ┌──────▼──────┐    ┌───────▼──────┐
   │ Sonos       │     │ Music Files │    │ Music        │
   │ Speakers    │     │  (on disk)  │    │ Assistant    │
   │ (UPnP/HTTP) │     │             │    │ (via WebDAV) │
   └─────────────┘     └─────────────┘    └──────────────┘
```

## License

MIT
