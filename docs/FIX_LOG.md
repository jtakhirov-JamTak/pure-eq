# Fix Log

One entry per real defect found in this app, newest first. Five fields, per the fix-log
rule in `~/.claude/CLAUDE.md`:

```
### YYYY-MM-DD — <one-line statement of what was actually wrong>

**Problem:** what broke, what the user saw, and why it was not caught earlier.
**Fix:** what changed, and why this fix rather than the obvious one.
**Regression test:** the test that fails on the exact failing input before the fix,
proven non-vacuous by mutation (see `VACUOUS-PASS`, REVIEWER_CONVENTIONS §6) — break it
on purpose, watch it go red, revert. "Looks correct" is not a result.
**Found in:** production / review / a user report / a test.
```

Pure EQ is not built from `app-foundation`, so there is one log here rather than the
inherited/own pair a template-derived app keeps. Everything in this file is this app's.

This is the only app with real users, which is the entire reason this file exists: a
defect here reaches someone. Record the ones that shipped, not the ones caught in review —
those are just work. An entry earns its place by being something the next person, or the
next session, would otherwise repeat.

_No entries yet._
