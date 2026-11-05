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

Choose **Categories** beside **New mission**, or **Manage categories** in the task editor. Add a category or edit its name and **XP weight**, then press **Save**. Weights default to 1× and support 0.1×–5× in steps of 0.1. Empty categories remain available, duplicate names are prevented, and at least one category must remain.

Tasks can select **multiple categories** using checkboxes. Their weights **add together**, not average or multiply: Engineering 1.5× plus Learning 0.5× means 2× total weight. **XP = priority base × effort multiplier × summed category weights**, rounded to the nearest whole XP. The editor shows the full calculation; pending task estimates and the priority-aware ROI sort use current weights.

**Earned XP is permanently retained.** Later weight changes, category edits, renames, deletions, effort changes or reopening a task do not recalculate its earned XP or issue additional credits. Only tasks that have not earned XP yet use the new estimate at first completion.

Deleting a category removes that assignment from tasks that have other categories. The manager asks for a replacement only for tasks that would otherwise have none. This also applies to completed/deleted task records, retaining earned XP and completion dates. Category assignment changes are recorded in activity history. Category grouping displays each task's combination once, and category filters match any selected category. Reports for overlapping categories contain shared tasks and should not be added together; overall metrics count every task once.

Existing v1 backups/databases load automatically as single-category tasks with 1× weights when no weights were saved. Data is normalized on read and persisted on the next save; no database reset is needed. For this upgrade, pull **both `server.py` and `dist/`**, restart the server, and reload **all** connected browsers. Older tabs are asked to reload before saving, and new app files ask for a server restart if an older server is still running. Keep your existing `data/` folder.

## Daily and weekly efficiency metrics

Open **Efficiency metrics** in the sidebar. Select Daily or Weekly, a reference date, and an optional category. Previous/next and Current period navigate the report. The dashboard shows:

- First task completions: each task counts once, even if reopened; later deletion preserves historical output.
- On-time rate: on-time first completions divided by all first completions in the period. With no completions, the rate is a dash. Timely deadline changes are respected; rescheduling after a missed due day does not retrospectively make it on time.
- XP earned: actual XP attributed to its original award timestamp, rather than the latest completion timestamp or current task estimate. Spending reward credits does not reduce XP output.
- Focus minutes: durations of completed focus sessions; incomplete/reset sessions, estimates, and browser-open time are excluded.
- Overdue carryover: unfinished, non-deleted overdue tasks at a historical period's end, or now for the current period. Task status and due-date changes are replayed from available activity history.

Daily Operations includes today's first completions, XP earned and completed focus minutes alongside its existing due-today progress bar. These totals cover all categories, independent of the task-list filters. A link opens the full efficiency report.

The dashboard has an on-time percentage ring and three seven-day bar charts: first completions, XP earned, and completed focus minutes. Charts use the same dates but separate, labeled scales and units; zero-activity periods do not invent values and upcoming dates show a dash. Weekly reports run Monday–Sunday; daily reports show trailing seven-day charts. Current periods are labeled “So far.” Dates follow the viewing machine's local timezone; use the same timezone across devices for identical day boundaries. Filters match any current category assignment; filtered category reports can overlap, while overall totals count tasks once. Legacy records without detailed activity history use their stored values as a fallback. Metrics are derived from existing records and do not require a database migration. No late-reward penalty is enabled by this feature.

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
- List view starts with the top five matching tasks; **Show 5 more** reveals another five and **Show top 5** reduces it again. Filtering, changing sort, or switching views resets the list to five. Board view retains the full set. Counts show how many of the matching tasks are displayed.
- **Best ROI · priority first** ranks high before medium before low. Within each priority: overdue tasks first, then available XP per estimated hour, then due date. The estimate uses Small=15, Medium=45, Large=120 and Major=240 minutes; already-rewarded tasks have zero additional XP return. This measures game-reward efficiency, not business value or actual measured effort. Priority/date sorts remain available. Grouping controls presentation; top-five selection is global across matching tasks.
- Both Reward Exchange panels can be collapsed independently. Each browser remembers the collapsed state and sort preference; balance and reward count remain visible in the collapsed header. Categories/tasks/rewards themselves continue to synchronize through SQLite.
- Day/week/month history by completion, creation or due date, plus category, status and text filters. Weeks start Monday; dates use the machine’s local time. Task activity remains available after deletion.
- Active tasks past their due date have a prominent overdue badge, border, and review banner. **Review & reschedule** lets you set a new priority and date, with Today/Tomorrow shortcuts. Dates are not automatically rolled forward; no overdue penalties apply. Previous due dates and priority changes stay in the activity log. Review excludes completed/deleted tasks and leaves effort estimates, earned XP, and credit transactions unchanged.
- XP = priority base × estimated effort × sum of selected category weights, rounded to a whole XP. High/medium/low priority supplies 40/30/20 base XP. Small/medium/large/major effort multiplies it by 0.5/1/2/3. Each category defaults to 1×; its weight is editable in Manage categories. For example, high priority + large effort + categories weighted 1.5× and 0.5× gives 40 × 2 × 2 = 160 XP. Effort is a scope estimate, not measured timer time.
- Each task still earns 10 credits once; every 200 XP advances a level. Old tasks default to medium effort, preserving the previous estimate. Previously earned XP and credit transactions are never recalculated. Editing a completed task’s effort or reopening it does not grant more XP/credits. Pull both server and app changes, restart, and reload all browsers when upgrading.
- Create/edit/remove personal rewards; redeem credits with confirmation. Receipts preserve the original name, cost and break duration after edits or removal. Breaks are personal promises, not externally delivered purchases.
- Focus timer with 15/25/50-minute presets or 1–180 custom minutes, pause/resume/reset, collapsible controls, and completed session history. Timer completion doesn’t automatically complete the task or grant XP. Refresh or reopen the app to record a deadline reached while it was closed. No background alarm or notification is promised.
- Responsive, keyboard-accessible UI using native forms and dialogs. No demo tasks or artificial starting credits are inserted.
- Completing a task shows a brief neon checkmark, pixel burst and the actual XP/credit gain after the save succeeds. Both the checkbox and status dropdown support it. Reopened tasks show that rewards were already earned; failed/conflicting saves do not celebrate. Reduced-motion preferences use a static confirmation instead. The effect never blocks clicks or delays saving and adds no dependencies.

## Files and checks

`dist/` contains the static browser app, including `server-config.js`. Static hosting leaves SQLite disabled. `server.py` serves the same app with shared SQLite enabled; `diagnose.py` checks LAN connections. `model.js` contains the data rules and `app.js` handles the browser UI.

Optional tests require Node.js 18+; Node is not needed to run or host the app:

```sh
node --test tests/model.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The server tests use temporary databases and loopback servers. The `.openai/hosting.json` file associates this checkout with its separate private Sites deployment. It is not required for local hosting and does not connect the cloud deployment to your Mac mini. Do not copy that association into a separately registered Sites project.

### Daily mission partner

On Active missions, **Plan my day** chooses one main mission and up to two supporting tasks. The picker ranks active tasks using priority-aware ROI; you decide what to commit to. Planning does not change due dates, carry tasks forward, or award XP. Each local calendar day has its own plan, and earlier plans remain available in **Daily debrief**.

**Help me start** opens an editable first step and starts a ten-minute focus session. It also appears as a bolt button on active task cards. Existing timers must be finished or reset first. The step is stored in task history and shown while its timer is active. Starting or finishing a session does not complete the task or award XP.

**Daily debrief** shows actual first completions, earned XP, and completed focus minutes for the selected date. Save a reflection (up to 1,000 characters), review prior reflections, or revise unfinished tasks and their dates. Planned task statuses show their current state; historical metrics use recorded activity. Plans and reflections are included in JSON exports and SQLite synchronization.

For this update, pull the complete checkout, **restart `server.py`**, and reload every connected browser. Existing databases and backups gain an empty `dailyPlans` list automatically. Do not delete `data/`. API integrations must preserve `dailyPlans` when updating the workspace and send `X-Quest-Schema: daily-companion-v1` with the current `If-Match` revision. Older clients receive HTTP 426 until updated, to prevent losing plans and reflections.
