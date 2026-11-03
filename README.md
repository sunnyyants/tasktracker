# QUEST//OS

A lightweight daily task tracker with the approved cyberpunk design. **No npm install, build step, framework, database installation, account, external fonts or CDN required.** Python's standard library provides the local SQLite server. Static hosting remains supported with browser-only storage.

## Install and update from GitHub

On the Mac mini:

```sh
git clone https://github.com/sunnyyants/tasktracker.git
cd tasktracker
python3 server.py --host 0.0.0.0 --port 8080
```

If you already use the ZIP installation, export a JSON backup and stop its server first. Copy that installation's **entire `data/` directory** into this freshly cloned `tasktracker/` folder before starting. This keeps your existing database. Alternatively, import your JSON backup into the newly started app. Keep the old installation until you have verified your tasks appear.

For later updates, stop the server with Ctrl+C, then run inside the cloned folder:

```sh
git pull --ff-only
python3 server.py --host 0.0.0.0 --port 8080
```

Reload the app on your laptops after updating. Git ignores `data/`, SQLite files and exported app backups, so pulls do not replace the database. Keep regular backups independently of Git.

## Manage categories

Choose **Categories** beside **New mission**, or **Manage categories** in the task editor. Add a category, edit its name and press **Save**, or select **Delete** and choose where to move existing tasks. The manager includes empty categories and prevents duplicate names. At least one category must remain.

Renaming/reassigning updates active, completed and deleted task records; no tasks, XP, credits or completion dates are removed. Changes are recorded in task activity history. Task/history filters and the task editor use the saved category list. Existing v1 backups/databases are upgraded automatically when loaded/saved. For this upgrade, replace **both `server.py` and `dist/`**, restart the server, and reload all connected browsers.

## Mac mini: one shared SQLite workspace

Copy this entire folder to the **Mac mini**, not just `dist/`. Python 3.9+ is required. Stop the old web server with Ctrl+C in its Terminal first, then open Terminal in this folder:

```sh
python3 server.py --host 0.0.0.0 --port 8080
```

Alternatively double-click **Start.command**, or run `sh Start.command`. If macOS prevents opening a downloaded launcher, use the explicit Python command above. No database setup or additional Python packages are needed. The database is created at `data/quest.sqlite3` beside `server.py`.

On the mini open **http://localhost:8080**. On the other laptop open **http://192.168.50.141:8080** if that is still the mini's actual LAN IP. Both now use the same tasks, rewards, XP, credits, history and active focus timer. Other open devices refresh within about three seconds. Conflicting saves are rejected and the latest state is loaded; retry your edit if notified.

This is one personal shared workspace, not multiple user accounts. Keep the Mac mini awake and the Terminal server running. An optional shared password can be enabled:

```sh
python3 server.py --host 0.0.0.0 --port 8080 --password
```

The server privately prompts for the password; browser username is **quest**. There is no password by default. This is a trusted-LAN server using HTTP; an optional password does not encrypt network traffic. Do not expose the port to the public internet.

### Move existing browser tasks into SQLite

Export JSON from the old hosted/static app. Open the new Mac-mini app, choose **Data & portability → Import backup**, and import it once. Confirming this replaces the shared workspace for every connected device. Existing browser-local data is left untouched; it is never uploaded automatically. The hosted `chatgpt.site` app and the Mac mini are separate installations.

### If the local-IP URL says “This site can’t be reached”

That message is a connection problem, not a password rejection. A deliberately enabled app password produces a browser login prompt/HTTP 401.

1. Check **http://localhost:8080 on the Mac mini itself**. If it fails, the server is stopped, the port differs, or startup reported an error.
2. If localhost works, restart using the command above with **`--host 0.0.0.0`**. The earlier static command with `--bind 127.0.0.1` accepts only connections from the mini itself.
3. Run the read-only diagnostics **on the Mac mini**:

   ```sh
   python3 diagnose.py
   ```

   It prints this machine's LAN IP, tests localhost and LAN access, and displays the listening process. A listener such as `*:8080` accepts LAN connections; `127.0.0.1:8080` does not.
4. In macOS Firewall options, allow the Python executable used by this server to accept incoming connections. If macOS requests permission, allow it. Do not disable the whole firewall. If your macOS version prompts for Local Network access for Terminal/Python, allow it for this intended LAN use.
5. Verify both devices use the same normal LAN, not an isolated guest Wi-Fi network. Check the mini's current IP in its network settings, and check VPN or router client-isolation settings. No router port forwarding is needed for same-LAN access.

Apple documents app-specific incoming-connection permissions in its [Mac Firewall guide](https://support.apple.com/guide/mac-help/mh34041/mac).

If port 8080 is occupied, stop the old server or use `--port 8081` and change the URL accordingly. To see the process without stopping anything:

```sh
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

### Back up the shared database

The app's JSON export works from any connected laptop. For a database-file backup, stop the server first, copy the entire `data/` folder, then restart. Do not copy only the `.sqlite3` file while the server is running, because SQLite may also have active `-wal` files. The server never serves the database file or source code over HTTP.

Optional SQLite Docker deployment (not tested here):

```sh
docker build -f Dockerfile.sqlite -t quest-os-sqlite .
docker run --rm -p 8080:8080 -v quest-os-data:/data quest-os-sqlite
```

The named volume preserves SQLite data between container restarts. Image creation requires internet access. Docker is optional; the Python command is the simplest Mac-mini setup.

## Static browser-only mode on macOS, Windows or Linux

Install Python 3 if it is not already available, then open a terminal in this folder:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

On Windows use `py -m http.server 8080 --bind 127.0.0.1 --directory dist`.

Open **http://localhost:8080** in a modern browser. Stop the server with Ctrl+C. This command serves only your own machine. Use a normal static web host for remote access; the Python server is a local convenience.

## Deploy anywhere

Upload **the contents of `dist/`** to any static web host (Nginx, Apache, a static hosting service, or an existing web server). All asset paths are relative, so deployment under a subfolder works too. There are no environment variables, API keys or server routes. No runtime internet connection is needed when the files are served locally.

Optional Docker deployment (requires Docker, not needed for normal use):

```sh
docker build -t quest-os .
docker run --rm -p 8080:80 quest-os
```

Open http://localhost:8080. Docker publishes that port to network interfaces by default. To keep it local use `-p 127.0.0.1:8080:80`. Building the image requires an internet connection to obtain the Nginx base image. Docker execution was not tested in this environment.

## Data in static browser-only mode

- Browser localStorage saves tasks, rewards, credit transactions, completed focus sessions and the active timer. Reloading preserves the timer; it uses a deadline rather than counting browser ticks.
- **Data & portability → Export JSON backup** downloads your data. On another machine deploy the same files, open the app, then choose **Import backup**. Import replaces local data after confirmation; export first to retain both copies.
- Data is local to the browser profile **and origin** (protocol, hostname and port). Changing from localhost to 127.0.0.1 or using another port, browser or machine creates a separate store. There is no automatic synchronization or server-side backup. Clearing site data or private browsing can remove your data.
- Import supports QUEST//OS v1 JSON backups up to 5 MB. Backups include task history, reward redemption history, sessions and an active timer. The active timer’s deadline continues to elapse during a move.
- Multiple tabs on the same origin receive storage updates. Conflicting writes are rejected with a reload message.
- Opening `dist/index.html` directly may render, but browser storage behavior for `file:` URLs varies. Use an HTTP server for reliable storage.

## Features

- Add, edit, prioritize, categorize, complete, reopen and soft-delete tasks.
- List or Board views, compact rows, grouping by status/category/priority, collapsible groups, search, category and due-date scope filters.
- Day/week/month history by completion, creation or due date, plus category, status and text filters. Weeks start Monday; dates use the machine’s local time. Task activity remains available after deletion.
- High/medium/low priority grants 40/30/20 XP at first completion; each task earns 10 credits once. Each 200 XP advances a level. Reopening and deleting preserves earned rewards and cannot produce duplicate credits.
- Create/edit/remove personal rewards; redeem credits with confirmation. Receipts preserve the original name, cost and break duration after edits or removal. Breaks are personal promises, not externally delivered purchases.
- Focus timer with 15/25/50-minute presets or 1–180 custom minutes, pause/resume/reset, collapsible controls, and completed session history. Timer completion doesn’t automatically complete the task or grant XP. Refresh or reopen the app to record a deadline reached while it was closed. No background alarm or notification is promised.
- Responsive, keyboard-accessible UI using native forms and dialogs. No demo tasks or artificial starting credits are inserted.

## Files and checks

`dist/` contains the static browser app, including `server-config.js`. Static hosting leaves SQLite disabled. `server.py` serves the same app with shared SQLite enabled; `diagnose.py` checks LAN connections. `model.js` contains the data rules and `app.js` handles the browser UI.

Optional tests require Node.js 18+; Node is not needed to run or host the app:

```sh
node --test tests/model.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The server tests use temporary databases and loopback servers. The `.openai/hosting.json` file associates this checkout with its separate private Sites deployment. It is not required for local hosting and does not connect the cloud deployment to your Mac mini. Do not copy that association into a separately registered Sites project.
