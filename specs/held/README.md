# Held back until Reels is turned on

`docs-reels.patch` adds Reels to the public docs (privacy policy, terms,
support, App Store notes). It is held because Reels ships switched off
(`EXPO_PUBLIC_REELS=off`, build-plan §9.2) and the live privacy policy should
not describe a feature nobody can use.

When Jan turns Reels on, before the flag flips:

    patch -p1 < specs/held/docs-reels.patch

then check the one hedged sentence (what metadata iOS writes into a recorded
video, 05 §13.2) against a real reel, merge to `main` so Pages republishes,
and only then turn the flag on.
