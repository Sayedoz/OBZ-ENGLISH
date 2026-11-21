# English Geniuses – عباقرة اللغة الإنجليزية

An English learning platform for Grades 1–3 (Look 1, 2 and 3) at Osama Bin Zaid Primary Boys School, Bahrain – English Department.

- Learning zones and games for every unit, reading steps, fluency pyramids and letter tracing
- The English Playground (Word World, Sound Lab, Grammar Kingdom, Story Studio)
- Teacher dashboard: Lesson Maker, live answers, reports and certificates

## How it is built
| Part | File | What it does |
|---|---|---|
| The app | `public/index.html` | Everything students and the teacher see |
| Server + online database API | `src/worker.js` | Cloudflare Worker: serves the app and saves/loads every document in a **D1** database (`/api/*`) |
| Settings | `wrangler.jsonc` | Worker name, static files folder and the D1 database binding `DB` |

**Where data is saved:** every answer is saved on the device *and* sent to the D1 database within about half a second
(also when the tab or app is closed). Every device loads from the database, so progress is never lost and follows the
student to any phone, tablet or computer. The teacher's *Live answers* list updates every 1–2 seconds.

**Privacy:** class lists (names and PINs) are stored only AES-encrypted with the school code. Progress records use
student numbers, not names. Once the `EG_KEY` secret is set, the server only answers devices that have the school code.

## Publish on Cloudflare
The repository is connected to a Cloudflare Worker (Workers Builds, deploy command `npx wrangler deploy`).
1. Push to `main` → Cloudflare builds and deploys. On the first deploy Wrangler **creates the D1 database
   `english-geniuses-db` automatically** and binds it as `DB` (the table is created on first use).
2. The Worker's name in Cloudflare must match `"name"` in `wrangler.jsonc` (`obz-english`). If yours is different, change it there.
3. Open the site → **Teacher login** → school code, then PIN → **My class → Online & backup** → copy the **Cloudflare server key**.
4. Worker → **Settings → Variables and Secrets → Add → Type: Secret, Name: `EG_KEY`, Value: the key** → Deploy.
   The teacher page then shows *🔒 locked*. Secrets are kept on later deploys.
5. Copy the **Student link** from *Online & backup* and send it to families. Opening it once sets up the device;
   students then log in with class → name → PIN.

Designed by T. Sayed Mustafa Hasan.
