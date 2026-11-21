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

**Where data is saved:** everything lives in the D1 database – classes, students, PINs, the teacher PIN (hashed),
lessons and all progress. Every answer is sent within about half a second (also when the tab or app is closed).
Any phone, tablet or computer that opens the site sees the classes straight away – no setup, no school code.

**Logins:** the server checks every PIN and gives the device a login token. A student can only save his own
progress; only the teacher can change classes or see other students. Wrong PINs are limited to 6 tries per 10 minutes.
The class and student names (without PINs) are visible on the login screen to anyone with the site address.

## Publish on Cloudflare
The repository is connected to a Cloudflare Worker (Workers Builds, deploy command `npx wrangler deploy`).
1. Push to `main` → Cloudflare builds and deploys. On the first deploy Wrangler **creates the D1 database
   `english-geniuses-db` automatically** and binds it as `DB` (tables are created on first use).
2. The Worker's name in Cloudflare must match `"name"` in `wrangler.jsonc` (`obz-english`). If yours is different, change it there.
3. **First time only:** open the site → **Teacher login** → enter the school code → create your teacher PIN.
   This uploads all classes to the database. Do this before you share the link.
4. From then on, on any device: **Teacher login** → your PIN only. Students: class → name → PIN.
5. Share the site address with families (it is shown in **My class → Online & backup → Student link**).

Designed by T. Sayed Mustafa Hasan.
