"""Serve only the application on localhost. No external network interface."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

APP = (Path(__file__).resolve().parents[1] / "app").resolve()

class Handler(SimpleHTTPRequestHandler):
    # Windows can register .mjs as text/plain; browsers require a JavaScript MIME.
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript; charset=utf-8",
                      ".js": "text/javascript; charset=utf-8",
                      ".json": "application/json; charset=utf-8"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP), **kwargs)

    def do_GET(self):
        path = unquote(urlsplit(self.path).path).lstrip("/")
        resolved = (APP / path).resolve()
        if not resolved.is_relative_to(APP) or any(part.startswith(".") for part in Path(path).parts):
            self.send_error(404)
            return
        if resolved.is_dir() and not (resolved / "index.html").is_file():
            self.send_error(404)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1] if len(args) > 1 else "") not in ("200", "304"):
            super().log_message(fmt, *args)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"La campaña: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
