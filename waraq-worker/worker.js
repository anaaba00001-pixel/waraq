// خادم Cloudflare Pages. بيانات الدخول والاتصال بـ D1 تأتي من إعدادات المشروع.
const categories = ["يومياتي", "أفكاري", "ملاحظاتي التقنية"];
const defaults = ["دلال حائل", "تفقّد", "Dependency Guard"];
const encoder = new TextEncoder();

function json(value, status = 200) {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorized(request, password) {
    const header = request.headers.get("Authorization") || "";
    if (!header.startsWith("Basic ")) return false;
    let credentials;
    try { credentials = atob(header.slice(6)); } catch { return false; }
    const hash = value => crypto.subtle.digest("SHA-256", encoder.encode(value));
    const [actual, expected] = await Promise.all([hash(credentials), hash("waraq:" + password)]);
    const a = new Uint8Array(actual);
    const b = new Uint8Array(expected);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    return difference === 0;
}

function validProject(name) {
    return typeof name === "string" && name.trim().length > 0;
}

function validNote(note) {
    return note && ["id", "title", "body", "project", "date"].every(key => typeof note[key] === "string")
        && note.title.trim() && categories.includes(note.cat) && Number.isFinite(Date.parse(note.date));
}

async function readState(db) {
    const [projects, notes] = await db.batch([
        db.prepare("SELECT name FROM projects ORDER BY id"),
        db.prepare(`SELECT n.id, n.title, n.body, n.category AS cat,
            coalesce(p.name, '') AS project, n.updated_at AS date
            FROM notes n LEFT JOIN projects p ON n.project_id = p.id
            ORDER BY n.updated_at DESC, n.id`)
    ]);
    return { projects: [...new Set([...defaults, ...projects.results.map(p => p.name)])], notes: notes.results };
}

function insertProjects(db, projects) {
    return db.prepare(`INSERT INTO projects(name)
        SELECT value FROM json_each(?) WHERE true ON CONFLICT(name) DO NOTHING`)
        .bind(JSON.stringify(projects));
}

async function mutate(db, data) {
    switch (data?.action) {
        case "project":
            if (!validProject(data.name)) return json({ error: "اسم المشروع غير صالح." }, 400);
            await insertProjects(db, [data.name]).run();
            break;
        case "save": {
            const n = data.note;
            if (!validNote(n)) return json({ error: "بيانات الملاحظة غير صالحة." }, 400);
            const statements = [insertProjects(db, n.project ? [n.project] : [])];
            const date = new Date().toISOString();
            if (typeof data.previousDate === "string") {
                statements.push(db.prepare(`UPDATE notes SET title=?, body=?, category=?,
                    project_id=(SELECT id FROM projects WHERE name=?), updated_at=?
                    WHERE id=? AND updated_at=?`)
                    .bind(n.title, n.body, n.cat, n.project, date, n.id, data.previousDate));
            } else {
                statements.push(db.prepare(`INSERT INTO notes(id,title,body,category,project_id,updated_at)
                    VALUES (?,?,?,?,(SELECT id FROM projects WHERE name=?),?)
                    ON CONFLICT(id) DO NOTHING`).bind(n.id,n.title,n.body,n.cat,n.project,date));
            }
            const [, result] = await db.batch(statements);
            if (!result.meta.changes) return json({ error: "تغيّرت الملاحظة. احتفظي بنصك ثم أعيدي فتحها." }, 409);
            break;
        }
        case "delete": {
            if (typeof data.id !== "string" || typeof data.previousDate !== "string") {
                return json({ error: "بيانات الحذف غير صالحة." }, 400);
            }
            const result = await db.prepare("DELETE FROM notes WHERE id=? AND updated_at=?")
                .bind(data.id, data.previousDate).run();
            if (!result.meta.changes) return json({ error: "تغيّرت الملاحظة. أعيدي فتحها قبل الحذف." }, 409);
            break;
        }
        case "import": {
            const { projects, notes } = data.backup || {};
            if (!Array.isArray(projects) || !projects.every(validProject) || !Array.isArray(notes)) {
                return json({ error: "صيغة النسخة غير صالحة." }, 400);
            }
            const names = new Set(projects);
            if (!notes.every(n => validNote(n) && (!n.project || names.has(n.project)))
                || new Set(notes.map(n => n.id)).size !== notes.length) {
                return json({ error: "توجد ملاحظات غير صالحة أو معرّفات مكررة." }, 400);
            }
            await db.batch([
                insertProjects(db, projects),
                db.prepare(`INSERT INTO notes(id,title,body,category,project_id,updated_at)
                    SELECT j.value ->> '$.id', j.value ->> '$.title', j.value ->> '$.body',
                        j.value ->> '$.cat', p.id, j.value ->> '$.date'
                    FROM json_each(?) j LEFT JOIN projects p ON p.name = (j.value ->> '$.project')
                    WHERE true ON CONFLICT(id) DO NOTHING`).bind(JSON.stringify(notes))
            ]);
            const state = await readState(db);
            const byId = new Map(state.notes.map(n => [n.id, n]));
            const conflicts = notes.filter(n => {
                const stored = byId.get(n.id);
                return !stored || ["title","body","cat","project","date"].some(key => n[key] !== stored[key]);
            }).length;
            return json({ ...state, conflicts });
        }
        default:
            return json({ error: "عملية غير معروفة." }, 400);
    }
    return json(await readState(db));
}

export default {
    async fetch(request, env) {
        if (!env.WARAQ_PASSWORD || !env.DB) {
            return new Response("أضيفي WARAQ_PASSWORD و DB في إعدادات Cloudflare.", {
                status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
            });
        }
        if (!await authorized(request, env.WARAQ_PASSWORD)) {
            return new Response("Sign in to Waraq", { status: 401, headers: {
                "WWW-Authenticate": 'Basic realm="Waraq"', "Cache-Control": "no-store"
            } });
        }
        const url = new URL(request.url);
        if (url.pathname !== "/api/notes") {
            if (!["/", "/index.html"].includes(url.pathname)) return new Response(null, { status: 404 });
            const response = await env.ASSETS.fetch(request);
            const headers = new Headers(response.headers);
            headers.set("Cache-Control", "no-store");
            headers.set("X-Frame-Options", "DENY");
            return new Response(response.body, { status: response.status, headers });
        }
        try {
            if (request.method === "GET") return json(await readState(env.DB));
            if (request.method !== "POST") return json({ error: "طريقة الطلب غير مدعومة." }, 405);
            if (request.headers.get("Origin") !== url.origin
                || request.headers.get("Content-Type") !== "application/json") {
                return json({ error: "مصدر الطلب غير مسموح." }, 403);
            }
            const raw = await request.text();
            if (encoder.encode(raw).length > 1500000) {
                return json({ error: "حجم الطلب كبير. استخدمي أداة تجهيز القاعدة لنقل نسخة JSON كبيرة." }, 413);
            }
            let data;
            try { data = JSON.parse(raw); } catch { return json({ error: "صيغة الطلب غير صالحة." }, 400); }
            return await mutate(env.DB, data);
        } catch {
            return json({ error: "تعذر الوصول إلى قاعدة ورق. تحققي من الجداول والارتباط DB." }, 500);
        }
    }
};
