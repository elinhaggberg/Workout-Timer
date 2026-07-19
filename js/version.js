// Bump APP_VERSION and add a CHANGELOG entry with every user-visible
// release — whatsNew.js compares this against what a returning visitor
// last saw and shows the "What's new" sheet for anything newer. Keep the
// version string in YYYY.MM.DD form (zero-padded) so plain string
// comparison sorts the same as chronological order.
export const APP_VERSION = "2026.07.19";

export const CHANGELOG = [
  {
    version: "2026.07.19",
    date: "July 19, 2026",
    changes: [
      "Full backups now also include your goals, workout diary, and theme/settings, not just workouts — if you've exported one before, it's worth making a fresh one.",
      "You'll see a note like this one whenever the app updates, so you always know what's changed.",
    ],
  },
];
