#!/usr/bin/env python3
"""QUEST//OS single-workspace LAN server. Python 3.9+, standard library only."""
import argparse
import base64
import getpass
import hmac
import ipaddress
import json
import mimetypes
import math
import os
from pathlib import Path
import socket
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from uuid import uuid4
from datetime import datetime
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 5 * 1024 * 1024
ASSETS = {'/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js',
          '/model.js': 'model.js', '/style.css': 'style.css', '/icon.svg': 'icon.svg'}


def initial_state():
    return dict(version=1, categories=['Work', 'Design', 'Deep work', 'Admin'], categoryWeights={}, tasks=[], ledger=[], sessions=[], timer=None, rewards=[
        dict(id=str(uuid4()), name=name, cost=cost, minutes=minutes)
        for name, cost, minutes in [('Coffee break', 50, 10), ('Game time', 100, 30), ('Off-grid reset', 30, 15)]])


def validate(s):
    """Validate backups and writes; database and unrelated files are never served."""
    def require(ok):
        if not ok:
            raise ValueError('Invalid QUEST//OS v1 data.')
    def text(v, limit):
        return isinstance(v, str) and len(v) <= limit
    def integer(v, low, high):
        return type(v) is int and low <= v <= high
    def timestamp(v):
        try:
            return text(v, 40) and datetime.fromisoformat(v.replace('Z', '+00:00')) is not None
        except (ValueError, TypeError):
            return False
    require(isinstance(s, dict) and type(s.get('version')) is int and s['version'] == 1)
    for key in ['tasks', 'rewards', 'ledger', 'sessions']:
        values = s.get(key)
        require(isinstance(values, list) and len(values) <= 50000)
        require(all(isinstance(v, dict) and text(v.get('id'), 100) and v['id'] for v in values))
        require(len({v['id'] for v in values}) == len(values))
    for t in s['tasks']:
        require(text(t.get('title'), 200) and text(t.get('category'), 40))
        require(t.get('priority') in ['high', 'medium', 'low'] and t.get('status') in ['queued', 'progress', 'done'])
        try:
            require(text(t.get('due'), 10) and len(t['due']) == 10)
            datetime.strptime(t['due'], '%Y-%m-%d')
        except (TypeError, ValueError):
            raise ValueError('Invalid task date.')
        require(timestamp(t.get('createdAt')) and (not t.get('completedAt') or timestamp(t['completedAt'])) and (not t.get('deletedAt') or timestamp(t['deletedAt'])))
        require(integer(t.get('earnedXp'), 0, 120000))
        require(t.get('effort', 'medium') in ['small', 'medium', 'large', 'epic'])
        t.setdefault('effort', 'medium')
        assigned = t.get('categories', [t['category']])
        require(isinstance(assigned, list) and 1 <= len(assigned) <= 200)
        require(all(text(c, 40) and c.strip() and c == c.strip() for c in assigned))
        require(isinstance(t.get('events'), list) and len(t['events']) <= 50000)
        require(all(isinstance(e, dict) and text(e.get('type'), 30) and timestamp(e.get('at')) for e in t['events']))
    for r in s['rewards']:
        require(text(r.get('name'), 80) and integer(r.get('cost'), 1, 100000) and integer(r.get('minutes'), 0, 1440))
    for r in s['ledger']:
        require(text(r.get('label'), 200) and timestamp(r.get('at')) and integer(r.get('amount'), -100000, 100000) and r.get('type') in ['task', 'reward'])
    require(sum(r['amount'] for r in s['ledger']) >= 0)
    for t in s['sessions']:
        require(text(t.get('taskId'), 100) and text(t.get('title'), 200) and integer(t.get('seconds'), 60, 10800) and timestamp(t.get('startedAt')) and timestamp(t.get('endedAt')))
    if s.get('timer') is not None:
        t = s['timer']
        require(isinstance(t, dict) and text(t.get('id'), 100) and text(t.get('title'), 200))
        require(any(v['id'] == t.get('taskId') and not v.get('deletedAt') for v in s['tasks']))
        require(integer(t.get('seconds'), 60, 10800) and integer(t.get('remaining'), 0, t['seconds']))
        require(t.get('deadline') is None or type(t['deadline']) in [int, float] and 0 < t['deadline'] < 1e15)
        require(timestamp(t.get('startedAt')))
    categories = s.get('categories')
    if 'categories' not in s:
        names = {}
        for name in ['Work', 'Design', 'Deep work', 'Admin'] + [c for t in s['tasks'] for c in t.get('categories', [t['category']])]:
            names.setdefault(name.lower(), name)
        categories = list(names.values())
        for task in s['tasks']:
            task['categories'] = list(dict.fromkeys(names[c.lower()] for c in task.get('categories', [task['category']])))
            task['category'] = task['categories'][0]
    require(isinstance(categories, list) and 1 <= len(categories) <= 200)
    require(all(text(c, 40) and c.strip() and c == c.strip() for c in categories))
    require(len({c.lower() for c in categories}) == len(categories))
    for task in s['tasks']:
        assigned = task.get('categories', [task['category']])
        require(isinstance(assigned, list) and 1 <= len(assigned) <= 200)
        require(all(isinstance(c, str) and c in categories for c in assigned))
        require(len(set(assigned)) == len(assigned))
        task['categories'] = assigned
        task['category'] = assigned[0]
    weights = s.get('categoryWeights', {})
    require(isinstance(weights, dict))
    require(all(name in categories and type(weight) in [int, float] and math.isfinite(weight) and 0.1 <= weight <= 5 and abs(weight * 10 - round(weight * 10)) < 1e-8 for name, weight in weights.items()))
    result = {key: s.get(key) for key in ['version', 'tasks', 'rewards', 'ledger', 'sessions', 'timer']}
    result['categories'] = categories
    result['categoryWeights'] = weights
    return result


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO workspace VALUES (1, 1, ?)', (json.dumps(initial_state()),))
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def read(self):
        with self.connect() as db:
            revision, data = db.execute('SELECT revision,data FROM workspace WHERE id=1').fetchone()
        return dict(revision=revision, state=validate(json.loads(data)))

    def write(self, revision, state):
        state = validate(state)
        data = json.dumps(state, ensure_ascii=False, allow_nan=False)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = db.execute('SELECT revision FROM workspace WHERE id=1').fetchone()[0]
            if revision != current:
                return None
            db.execute('UPDATE workspace SET revision=?,data=? WHERE id=1', (current + 1, data))
        return dict(revision=current + 1, state=state)


class Handler(BaseHTTPRequestHandler):
    server_version = 'QuestOS/1.0'

    def authorized(self):
        password = self.server.password
        if password is None:
            return True
        expected = b'quest:' + password.encode()
        try:
            scheme, encoded = self.headers.get('Authorization', '').split(' ', 1)
            if scheme == 'Basic' and hmac.compare_digest(base64.b64decode(encoded, validate=True), expected):
                return True
        except (ValueError, TypeError):
            pass
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="QUEST OS", charset="UTF-8"')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return False

    def send(self, status, data=b'', content_type='application/json', headers=None):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def same_host(self):
        try:
            host = urlsplit('http://' + self.headers.get('Host', '')).hostname
            if not host:
                return False
            if host in ['localhost', socket.gethostname().lower(), socket.gethostname().lower() + '.local'] or host in self.server.allowed_hosts:
                return True
            address = ipaddress.ip_address(host)
            return address.is_private or address.is_loopback
        except ValueError:
            return False

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.same_host():
            self.send(403, dict(error='Unrecognized host. Use the server’s LAN IP address.'))
            return
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        if path == '/api/health':
            self.send(200, dict(ok=True, storage='sqlite'))
        elif path == '/api/state':
            value = self.server.store.read()
            etag = '"%s"' % value['revision']
            if self.headers.get('If-None-Match') == etag:
                self.send(304, headers={'ETag': etag})
            else:
                self.send(200, value, headers={'ETag': etag})
        elif path == '/server-config.js':
            self.send(200, b'window.QUEST_SERVER = {enabled: true, categoryWeights: true};\n', 'text/javascript; charset=utf-8')
        elif path in ASSETS:
            asset = self.server.static_dir / ASSETS[path]
            if not asset.is_file():
                self.send(404, dict(error='App files missing. Keep dist beside server.py.'))
                return
            content_type = mimetypes.guess_type(asset.name)[0] or 'application/octet-stream'
            self.send(200, asset.read_bytes(), content_type + '; charset=utf-8')
        else:
            self.send(404, dict(error='Not found.'))

    def do_PUT(self):
        if not self.same_host() or not self.authorized():
            if not self.same_host():
                self.send(403, dict(error='Unrecognized host.'))
            return
        if urlsplit(self.path).path != '/api/state':
            self.send(404, dict(error='Not found.'))
            return
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            self.send(403, dict(error='Cross-origin writes are not allowed.'))
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            self.send(415, dict(error='Use application/json.'))
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BYTES:
                self.send(413, dict(error='State must be between 1 byte and 5 MB.'))
                return
            revision = self.headers.get('If-Match', '').strip('"')
            if not revision.isdecimal():
                self.send(428, dict(error='A current If-Match revision is required.'))
                return
            if self.headers.get('X-Quest-Schema') != 'category-weights-v1':
                self.send(426, dict(error='Reload the updated app before saving multi-category rewards.'))
                return
            state = json.loads(self.rfile.read(length), parse_constant=lambda value: None)
            result = self.server.store.write(int(revision), state)
            if result is None:
                self.send(409, dict(error='Another device saved first. Refresh and retry your change.'))
            else:
                self.send(200, result, headers={'ETag': '"%s"' % result['revision']})
        except (ValueError, TypeError, KeyError, OverflowError, RecursionError):
            self.send(400, dict(error='Invalid QUEST//OS backup or state.'))
        except sqlite3.Error:
            self.send(503, dict(error='Database is unavailable. Check disk space and permissions.'))


def create_server(host='127.0.0.1', port=8080, db=None, password=None, allowed_hosts=()):
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    server.store = Store(db or ROOT / 'data' / 'quest.sqlite3')
    server.password = password
    server.allowed_hosts = set(allowed_hosts)
    server.static_dir = ROOT / 'dist'
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1', help='Use 0.0.0.0 to accept connections from your LAN.')
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--db', type=Path, default=ROOT / 'data' / 'quest.sqlite3')
    parser.add_argument('--password', action='store_true', help='Prompt privately for an optional shared password (username: quest).')
    parser.add_argument('--allow-host', action='append', default=[], help='Additional hostname, for example mac-mini.local.')
    args = parser.parse_args()
    password = getpass.getpass('Choose shared app password (username: quest): ') if args.password else None
    if args.password and not password:
        parser.error('Password cannot be empty.')
    try:
        server = create_server(args.host, args.port, args.db, password, args.allow_host)
    except (OSError, sqlite3.Error) as error:
        parser.exit(1, 'Could not start: %s\nCheck whether the port is occupied or the database folder is writable.\n' % error)
    print('QUEST//OS — SQLite shared workspace', flush=True)
    print('Database: %s' % args.db.resolve(), flush=True)
    print('On this Mac: http://localhost:%s' % server.server_port, flush=True)
    if args.host == '0.0.0.0':
        print('LAN access enabled. Other laptop: http://<this-Mac-LAN-IP>:%s' % server.server_port, flush=True)
    else:
        print('Local access only. Add --host 0.0.0.0 for other devices.', flush=True)
    print('Password: %s. Ctrl+C to stop.' % ('enabled; username quest' if password else 'not required'), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
