# QUEST//OS

A lightweight, self-contained daily task tracker with the approved cyberpunk design. **No npm install, build step, framework, database, account, external fonts or CDN required.**

## Run on macOS, Windows or Linux

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

## Data and moving machines

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

`dist/index.html`, `style.css`, `model.js`, `app.js`, and `icon.svg` are the entire runnable app. `model.js` contains the data rules and `app.js` handles the browser UI.

Optional tests require Node.js 18+; Node is not needed to run or host the app:

```sh
node --test tests/model.test.cjs
```

The `.openai/hosting.json` file associates this checkout with its private Sites deployment. It is hosting metadata, not required by another host. Do not copy that association into a separately registered Sites project.
