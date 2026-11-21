# English Geniuses – عباقرة اللغة الإنجليزية

An English learning platform for Grades 1–3 (Look 1, 2 and 3) at Osama Bin Zaid Primary Boys School, Bahrain – English Department.

- Learning zones and games for every unit, reading steps, fluency pyramids and letter tracing
- The English Playground (Word World, Sound Lab, Grammar Kingdom, Story Studio)
- Teacher dashboard: Lesson Maker, live answers, reports and certificates

## How it is built
| Part | File | What it does |
|---|---|---|
| The app | `index.html` | Everything students and the teacher see |
| Online database API | `functions/api/[[path]].js` | Cloudflare Pages Function that saves and loads every document in a **D1** database |

**Where data is saved:** every answer is saved on the device *and* sent to the D1 database within about half a second
(also when the tab or app is closed). Every device loads from the database, so progress is never lost and follows the
student to any phone, tablet or computer. The teacher's *Live answers* list updates every 1–2 seconds.

**Privacy:** class lists (names and PINs) are stored only AES-encrypted with the school code. Progress records use
student numbers, not names. The server only answers devices that send the key made from the school code (`EG_KEY`).

## Publish on Cloudflare (one-time setup)
1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →** choose `OBZ-ENGLISH`.
   Framework preset: *None*. Build command: *(leave empty)*. Build output directory: `/`. **Save and Deploy.**
2. **Storage & Databases → D1 SQL Database → Create →** name it `english-geniuses`. (The table is created automatically.)
3. Your Pages project **→ Settings → Bindings → Add → D1 database →** Variable name **`DB`** → database `english-geniuses` → Save.
4. **Deployments → ⋯ → Retry deployment** (bindings apply after a new deployment).
5. Open your site → **Teacher login** → school code, then PIN → **My class → Online & backup**.
   Copy the **Cloudflare server key**.
6. Pages project **→ Settings → Variables and Secrets → Add →** Type **Secret**, Name **`EG_KEY`**, Value = the key → Save,
   then **Retry deployment** again. The teacher page then shows *🔒 locked*.
7. Copy the **Student link** from *Online & backup* and send it to families. Opening it once sets up the device;
   students then log in with class → name → PIN.

Designed by T. Sayed Mustafa Hasan.
