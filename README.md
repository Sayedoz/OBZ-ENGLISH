# English Geniuses – عباقرة اللغة الإنجليزية

An English learning platform for Grades 1–3 (Look 1, 2 and 3) at Osama Bin Zaid Primary Boys School, Bahrain – English Department.

- Learning zones and games for every unit (Sound Safari, Word Treasure, Spelling Bee, Sentence Train, Review Challenge)
- Reading steps, fluency pyramids and letter tracing
- The English Playground (Word World, Sound Lab, Grammar Kingdom, Story Studio)
- Teacher dashboard: Lesson Maker (objective-based PPP), live answers, reports and certificates

The whole app is one file: `index.html`. Class lists are stored encrypted and are only unlocked on a device with the school code.

## Putting it online (one-time setup)

### 1. Website – GitHub Pages
Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
After a minute the site is live at `https://sayedoz.github.io/OBZ-ENGLISH/`.

### 2. Online database – Firebase (free plan)
1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics is not needed).
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable**.
3. **Build → Firestore Database → Create database** (production mode, a nearby location such as `europe-west`/`me-central`).
4. In Firestore open **Rules**, paste the contents of `firestore.rules` from this repository, and **Publish**.
5. **Authentication → Settings → Authorized domains → Add domain → `sayedoz.github.io`**.
6. **Project settings (⚙️) → Your apps → Web (</>)** → register an app → copy the `firebaseConfig` values
   (`apiKey`, `authDomain`, `projectId`, `appId`) into `EG_ONLINE` near the top of the online-database section in `index.html`
   (search for `const EG_ONLINE=`). These web keys are public identifiers, not passwords.

### 3. Use it
- Teacher: open the website → **Teacher login** → enter the school code once, then your PIN.
- **Teacher dashboard → My class → Online & backup → Student link**: send this link to students' families.
  Opening it once sets up the device; students then log in with class → name → PIN.
- Every answer students submit appears in **Live answers** within a few seconds, on any device.

Designed by T. Sayed Mustafa Hasan.
