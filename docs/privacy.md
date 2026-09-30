# Privacy Policy

**Last updated: 29 September 2026**

Sipply is a drinks field guide. You collect entries, and you can share what
you've had with people you follow. This policy describes exactly what the
app stores, where it goes, and how to get rid of it.

It is written to be accurate rather than broad. If something is not listed
here, Sipply does not collect it.

---

## What Sipply stores about you

**Account.** Your email address, used to sign in and nothing else. It is
held by our authentication provider and is never shown to other users.

**Profile.** Your username, display name, an optional bio, an optional
profile photo, and an accent colour. All of these are visible to anyone
signed in to Sipply.

**Posts.** When you log a drink you may share it as a post, with a caption
and your photo. Posts are visible to anyone signed in to Sipply.

**Photos.** Before a photo leaves your phone, whether for a post or for
your profile, it is re-encoded as a new image with no location and no other
camera metadata, and scaled to at most 2048 pixels on its longest side. If
that cannot be done, the photo is not uploaded. Photos are stored in a
private bucket and served only through short-lived signed links. They are
not public URLs and cannot be found by guessing an address. Each link
expires within the hour, and nobody you have blocked, or who has blocked
you, can get one.

**Social graph.** Who you follow, and which posts you have liked.

**Invite links.** When you share an invite, Sipply creates a random link
that stops working after 30 days. Anyone who accepts it in that time
follows you, and you follow them back, unless one of you has blocked the
other. We store the link, who made it and when, and when it stops working.

**Reports and blocks.** If you report content or block someone, we store
that you did so. A report also keeps a copy of what it is about — the
caption, the drink and when it was posted, and the author's username,
display name and bio — so that it can still be reviewed if the post or the
account is deleted. Blocks are private — the person you blocked is not
told.

**Your phone number (optional).** If you give it at signup, or later under
Find friends, it is stored as a salted hash rather than as the number, so
that people who already have your number can find you. It is never shown
to anyone. **Stop being findable** in Profile → Settings → Find friends
clears it from our servers.

**Contact matching (only if you use it).** If you ask Sipply to find friends
from your contacts, phone numbers are converted on your device into salted
hashes, and only those hashes are sent to be compared with people who have
made themselves findable. **Your contacts are never uploaded.** The hashes
are used only to check for matches and are not stored. Hashing hides a
number from casual view, but it is not encryption, so we treat these values
as personal data.

**Instagram matching (only if you use it).** Sipply has no connection to
Instagram and cannot read anything from your account — no Meta API gives an
app your follower or following list. If you want to find friends that way,
you download your own list from Instagram and open the file in Sipply. The
file is read **on your device**; the usernames in it are converted to
salted hashes, and only those hashes are sent for comparison, the same way
contacts are. **Your Instagram list is never uploaded**, and the hashes are
not stored. Your own handle, if you choose to add one so friends can find
you, is stored only as a hash, never in readable form, and is never shown
to other users. **Stop being findable** in Profile → Settings → Find
friends clears it.

**Matching limits.** To make matching hard to misuse for looking up
strangers, each account can check at most 3,000 phone numbers and
Instagram handles, counted together, in any 24 hours. To enforce that, we
record how many you checked and when, never the hashes themselves.

**On your device.** Your collection progress is stored only on your phone,
never on our servers, so the app works without a connection. The photos you
take are kept on your phone too; a photo is uploaded only when you share it
as a post or make it your profile photo. The phone number and Instagram
username you give for finding friends are kept on the phone in readable
form, because our servers hold only their hashes and the app would
otherwise ask for them again; **Stop being findable** removes them here as
well. The Instagram list you import is cached on the phone too, so
re-checking it does not need another download, and **Forget my imported
list** in Profile → Settings → Find friends clears it. Signing out clears
the list, the number and the username; your collection stays.

## What Sipply does not do

- **No analytics, no tracking, no advertising.** The app contains no
  analytics SDK, no crash-reporting service, no advertising identifier,
  and no third-party trackers of any kind.
- **We do not sell or share your data with anyone.**
- **We do not track you across other apps or websites.**
- **No profiling.** Nothing about you is scored or predicted. The one
  automatic check on what you write is a text filter: captions, bios,
  display names and usernames are checked when you save them, and text
  containing a slur or an explicit sexual term is refused. It refuses the
  text and does nothing else to your account.

## Who else can see it

**Other Sipply users** can see your profile, your posts, your photos, and
who you follow. Treat anything you post as public to everyone signed in.

**Supabase**, our hosting provider, stores the database and photos on our
behalf. They do not use it for their own purposes.

**Expo** delivers app updates. Each time Sipply starts, it asks Expo's
update server whether a newer version exists. The request carries the app
version, the platform, a random installation ID and, like any web request,
your IP address. It carries nothing about your account. Expo uses it to
deliver updates and shows us only totals, such as how many installs are on
each version.

**Apple**, if you are testing Sipply through TestFlight, receives standard
crash and installation information under Apple's own privacy policy.

That is the complete list.

## Deleting your account

Open **Profile → Settings** (the gear, top right) **→ Delete account**.

This permanently deletes your profile and profile photo, every post you
have made, every photo you have uploaded, your likes, your follows in both
directions, your invite links, and the hashes that make you findable. On
the phone you delete from, the collection is reset and the photos Sipply
kept for it are removed, and what Sipply remembered there for finding
friends (your number, your Instagram username, an imported Instagram list)
is forgotten. It cannot be undone, and your username becomes available to
someone else.

Your photos go first. The app deletes every one of them from storage, and
only when none are left is the account itself deleted. If a photo cannot be
removed — because the connection drops, say — the account stays and the
app tells you, so you can try again. An account is never removed with its
photos left behind. You do not have to email anyone to be deleted.

## Keeping it

Your data is kept until you delete your account. Reports are kept after
deletion, because a moderation record that vanishes when someone leaves is
not a moderation record. A report you filed is kept without your identity.
A report about you or something you posted is kept with the copy it made
when it was filed, your username included.

## Age

Sipply is about alcoholic drinks and is intended for people old enough to
drink where they live. It is rated 18+. It is not for children, and we do
not knowingly collect anything from anyone under 13. If you believe a
child has an account, contact us and it will be removed.

The [Terms of Use](terms) set out who may use Sipply and what is not
allowed on it.

## Your rights

Wherever you live, you can ask us for a copy of your data, ask us to
correct it, or ask us to delete it. Deletion is built into the app; for
anything else, email us.

If you are in the EEA or UK: our basis for processing is performing the
service you asked for (your account and posts) and our legitimate
interest in keeping the app safe (reports, blocks, the text filter and the
matching limits). You may complain to your local data protection
authority.

If you are in California: we do not sell or share personal information,
and we have not in the past twelve months.

## Security, honestly

Access to your data is enforced at the database level, so a modified app
cannot read what it should not. Photos are private and served only through
expiring links.

No service is perfectly secure, and Sipply is a small independent app rather
than a company with a security team. Please do not post anything you would
be harmed by if it became public.

## Changes

If this policy changes materially, the date at the top changes and the app
will say so before the change takes effect.

## Contact

**mcqueeny1617@gmail.com** — for privacy questions, data requests, or to
report something urgent.
