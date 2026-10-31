<p align="center"><img src="docs/assets/icon.png" alt="Code Akos icon" width="112" height="112"></p>

# Code Akos

Turn production errors into GitHub issues and pull requests you can review.

[![License badge](https://img.shields.io/badge/license-FSL--1.1--ALv2-blue)](LICENSE)
[![CI](https://github.com/Ayesh96/code-akos/actions/workflows/ci.yml/badge.svg)](https://github.com/Ayesh96/code-akos/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Ayesh96/code-akos)](https://github.com/Ayesh96/code-akos/releases/latest)

Code Akos runs on your own computer. Your app's Sentry SDK sends it errors. It groups repeats, files one GitHub issue for each new error, and has a model try a fix, which it opens as a pull request. It never merges anything. You pick the model: Ollama on your machine, or the DeepSeek or Anthropic API.

[Download Code Akos](#install) for Mac, Windows or Linux. The code is public under a source available license, which is not an open source license. [Read the terms](#license).

<p align="center"><img src="docs/assets/readme/pull-request-drawer.png" alt="An error in Code Akos: triage says what happened and what to do, a GitHub issue is filed, and the resolver has opened a pull request" width="440"><br><sub>One error, read by the model, filed as an issue, and fixed in a pull request.</sub></p>

## How it works

1. **Receive.** Code Akos accepts the same requests as Sentry (`store` and `envelope`). You change only the DSN in your app.
2. **Group.** Repeats count as one error. The group key is the exception type, the crashing file, and the text of the crashing line, so a changed line number or a user ID in the message does not split a group.
3. **Triage.** The model writes what happened and what to do, and adds tags such as `bot-safe`, `needs-human` or `infrastructure`.
4. **File an issue.** By default, each new error with a stack trace at level `error` or `fatal` becomes one GitHub issue. Code Akos comments again at 100, 1,000 and 10,000 events.
5. **Open a pull request.** For each open issue it filed, the resolver edits a throwaway copy of your branch, runs your check command before and after, and opens a pull request marked verified or unverified. The model can answer `SKIP` and give a reason instead.

<p align="center"><img src="docs/assets/readme/skipped-drawer.png" alt="An error where the resolver skipped the fix and says why: the bad value comes from the orders API" width="440"><br><sub>A skipped fix says why. Here the bad value comes from another service.</sub></p>

## Install

Download the file for your computer from the [latest release](https://github.com/Ayesh96/code-akos/releases/latest).

| Your computer | File |
|:--|:--|
| Mac with Apple Silicon (M1 or later) | `mac-arm64.dmg` |
| Mac with an Intel processor | `mac-x64.dmg` |
| Windows | `.exe` installer |
| Linux | `.AppImage` (run `chmod +x` on it first) |

The builds are unsigned, so your system warns the first time. On a Mac, go to System Settings › Privacy & Security and choose **Open Anyway**. On Windows, choose **More info › Run anyway**.

The app carries its own runtime. You need [git](https://git-scm.com/downloads), and at least one model:

* **Ollama on this machine.** Run `ollama pull qwen2.5-coder:7b` first. No model provider sees your code.
* **The DeepSeek or Anthropic API.** Error text and source code are sent to that provider.

If you pick more than one model, Code Akos moves to the next when one fails.

A setup with four steps opens on first launch. It checks each step before you continue: the ports are free, Ollama answers, and API keys work. Change anything later with **Settings** in the dashboard header. If Code Akos does not start with the new settings, the old ones are put back.

Apps that run in Docker: see [Running in Docker](docs/docker.md). Servers with no screen: see [running from source](docs/reference.md#running-from-source).

## Connect your first app

1. Choose **Projects › Add project**. Enter `owner/name`, a GitHub token, the branch to work on, and optionally a check command such as `npm ci && npm test`.
2. Set your Sentry SDK's `dsn` to the project's address, for example `http://codeakos@localhost:3000/1`. The project's **Setup guide** has the code for Python, Node.js and the browser.
3. Errors appear on the project's page. Those with a stack trace are filed as GitHub issues.

## Limits you should know about

* **The fix success rate is not measured.** Triage was measured on 12 replayed cases ([results](docs/TRIAGE-BEFORE-AFTER.md)). Fixes have not been. Treat every pull request as a proposal and review it.
* **The resolver ignores triage tags.** It tries every open issue Code Akos filed, including ones tagged `needs-human` or `infrastructure`. Each attempt costs money on a paid API, and an issue that fails is tried at most 3 times. To keep the resolver off an issue, close it.
* **The check command is not sandboxed.** It runs through `sh -c` in the working copy, after the model has edited the code. It has your user's permissions and the environment of the Code Akos process, which includes your model API keys.
* **The builds are unsigned.** The Windows, Linux and Intel Mac builds are also untested. Only the Apple Silicon build has been tested.
* **It is a tracker for one person.** There are no alerts, no tracing, no session replay and no multiple users.

## Compared with other tools

| | Code Akos | Sentry | GlitchTip | Bugsink |
|:--|:--|:--|:--|:--|
| Accepts Sentry SDK events | Yes | Yes | Yes | Yes |
| What you run | One app or Node process, SQLite | Docker Compose, 53 services, 4 cores, 16 GB RAM and 16 GB swap | One service and PostgreSQL, from 256 MB RAM | One container, SQLite, MySQL or PostgreSQL |
| Files GitHub issues | Automatically | By hand on Team, from alert rules on Business and up | Not in its docs | Not in its docs |
| Opens fix pull requests | Yes, with your model | Seer, $40 per active contributor per month on a paid plan | No | No |
| Alerts, teams | No | Yes | Yes | Yes |
| Tracing, session replay | No | Yes | Tracing yes, replay not in its docs | Not in its docs |
| License | `FSL-1.1-ALv2` | `FSL-1.1-Apache-2.0` | MIT | Custom, see its repository |

Facts about other tools were checked on 31 October 2026 against GlitchTip's [docs](https://glitchtip.com/documentation/), Bugsink's [docs](https://www.bugsink.com/docs/), Sentry's [hardware page](https://develop.sentry.dev/self-hosted/), its [compose file](https://github.com/getsentry/self-hosted/blob/master/docker-compose.yml), its [GitHub integration docs](https://docs.sentry.io/organization/integrations/source-code-mgmt/github/), the [Seer price](https://sentry.zendesk.com/hc/en-us/articles/45551407771931-What-is-the-pricing-for-Seer-January-21-2026), and GlitchTip's [install page](https://glitchtip.com/documentation/install). Seer bills a person as active after 2 or more pull requests in a month.

Choose Sentry for tracing, alerts and teams. Choose GlitchTip or Bugsink for a small tracker that several people share. Choose Code Akos if you maintain a project alone and want errors turned into pull requests you review, on your own machine.

## More

* [Documentation](https://ayesh96.github.io/code-akos/)
* [Reference](docs/reference.md): settings, ports, and how data is stored
* [Report a bug or ask for a feature](https://github.com/Ayesh96/code-akos/issues)
* [Contributing](CONTRIBUTING.md): sign off your commits with `git commit -s`, and run `npm run typecheck && npm test`

## License

Code Akos is source available under the [Functional Source License, version 1.1](LICENSE) (`FSL-1.1-ALv2`). That is not a license the Open Source Initiative approves.

* You can use, run, change and host it yourself, including inside a company, for free.
* You cannot use it to offer a competing commercial product or service.
* Each release becomes Apache 2.0 licensed two years after it is published.

The name "Code Akos" belongs to this project, so a fork has to use another name. To report a suspected violation, open an issue or contact the maintainer.
