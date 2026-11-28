# TA-DA

Plan an event together: the schedule day by day, who leads what, the lists (to buy, to bring, to do), rooms and guests, and what still needs attention.

**Open the app: https://mmikol.github.io/tada/**

This repository holds only the published app: plain files, with no events, no names and no data. The plans people make with it live in their own browsers, or in a private repository of their own.

## Using it

**On one device.** Open the link and start. Everything stays in that browser on that device, and the list of events says so.

**With other people.** One person sets up a shared plan, and everyone else opens an invitation link.

1. In the app, on the list of events: Settings (under Setup) → Sharing → Set up a shared plan.
2. The plan needs a **private** GitHub repository. A public one is refused.
3. It also needs a key for that repository. The screen links to GitHub's key form, which comes with a name, an expiry date and the one permission it needs (Contents: Read and write) filled in. Under **Repository access**, choose **Only select repositories** and pick the plan's repository alone. The app refuses a key that opens other repositories, and a classic token.
4. Paste the key and press Connect. Events already on the device can come along.
5. Settings → Sharing → Copy an invitation link, and send it privately. Whoever opens it sees and edits the same plan; a change reaches the others within a few seconds.

To let some people look without changing anything, Settings → Sharing → **A link that only looks** explains how to make a second key (Contents: Read-only) and makes its own link.

**On a phone.** Tap the invitation link; it opens in the browser, already in the plan. A copy added to the Home Screen starts empty the first time: paste the same invitation link into the box on its first screen once. If the site is not opened for a week, an iPhone may clear what it keeps; tapping the invitation link again brings everything back, so keep the message it came in.

**With no connection.** A shared plan opens anyway, on the plan as that device last saw it, read-only, and says so; when the connection is back it carries on by itself. A plan kept on one device works as usual.

**New versions.** When this site changes, an open page offers "A newer version of the app is ready. Reload".

## Privacy and safety

- The plan is never stored here. A shared plan lives in its owner's private repository; a plan on one device lives in that browser.
- An invitation link carries a key after the `#`, a part of an address that browsers never send to any server. Anyone holding a link can read the plan, and change it if its key can, so send links privately. To shut everyone out, delete the keys at github.com/settings/personal-access-tokens: the plan's own, and any made for links that only look.
- When a key has run out or been deleted, the app opens on a screen saying GitHub no longer accepts it. Paste a new key into the box there (it takes an invitation link or a new key), then send everyone new links from Settings → Sharing. Before a key runs out, Settings → Sharing → Replace the key does the same.
- The app checks, each time, that the plan's repository is private. It refuses classic tokens, and keys it finds opening this site's repository or the owner's other private repositories.
- Each device keeps a copy of the plan for when there is no connection. Settings → Sharing → Leave on this device deletes it, and so does a key that stops being accepted.
- The app talks only to this site and to api.github.com.

## How this repository is made

It is built from the app's source by `tools/build-site.mjs` and published by `tools/publish-site.sh`, which replaces everything here at each publish: do not edit these files by hand.

| Path | What it is |
|---|---|
| `index.html` | The page. |
| `v/<version>/` | The app's code and styles, in a folder named after its contents, with the last two versions kept beside it. |
| `sw.js` | The service worker: it keeps one whole version on each device, so the app opens with a poor connection or none. |
| `templates/` | The starter templates a new plan takes in once. |
| `manifest.webmanifest`, `icon*` | The name and icon on a phone's Home Screen. |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are. |
