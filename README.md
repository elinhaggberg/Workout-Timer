# Workout-Timer
A simple webapp for creating custom workouts with timers – free from fuzz, ads and personal data.

## Features

- **Custom workouts**: build your own sets and intervals, drag them into the order you want, with editable rounds and rest periods.
- **Tabata**: a quick-setup preset — just pick work/rest seconds and round count.
- **Classics library**: a built-in set of preset exercises, organized by category, to drop into a workout without building it from scratch.
- **Goals**: set a weekly workout target; a status strip on Home tracks progress and streaks.
- **Diary**: a history of past workouts, editable and deletable after the fact.
- **Play screen**: readable at a glance, with a screen wake lock so it doesn't sleep mid-set.
- **Customize**: Playful/Light/Dark themes with a choice of accent colors, plus a custom home screen title.
- **Backup & sharing**: export a single workout or a full backup as a JSON file; import always merges, never replaces.

## Architecture

No build step — plain HTML/CSS/JS modules. All data lives in `localStorage` on the device. This is the template the other apps in the family (My Closet, My Bookshelf, Focus Timer, Work It Daily) were built from.

## Deploying

Deployed via the included GitHub Actions workflow (`.github/workflows/deploy.yml`) to GitHub Pages on every push to `main` — no build step, no configuration needed.

## License

[GNU AGPL-3.0](LICENSE). Free to use, copy, and modify — but any version you distribute or run as a hosted service has to stay open source too.
