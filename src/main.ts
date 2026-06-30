import express from "express";
import session from "express-session";
import methodOverride from "method-override";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";

const app = express();
const port = process.env.PORT || 3000;

const dbDir = path.join(__dirname, "../db");
const uploadDir = path.join(__dirname, "../public/uploads");

fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dbDir, "nook.sqlite"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use(methodOverride("_method"));
app.use(session({
    secret: process.env.SESSION_SECRET || "nook-secret-dev",
    resave: false,
    saveUninitialized: false
}));

const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, callback) => {
        const cleanName = file.originalname.replace(/[^a-z0-9.]/gi, "_");
        callback(null, `${Date.now()}-${cleanName}`);
    }
});

const upload = multer({ storage });

function init() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'cliente'
        );

        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf TEXT,
            email TEXT,
            telefone TEXT,
            endereco TEXT
        );

        CREATE TABLE IF NOT EXISTS funcionarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf TEXT,
            email TEXT,
            telefone TEXT,
            funcao TEXT
        );

        CREATE TABLE IF NOT EXISTS livros (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            autor TEXT NOT NULL,
            ano INTEGER,
            quantidade INTEGER DEFAULT 0,
            capa TEXT
        );

        CREATE TABLE IF NOT EXISTS eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT NOT NULL,
            descricao TEXT,
            data TEXT,
            horario TEXT,
            local TEXT,
            vagas INTEGER DEFAULT 0,
            banner TEXT
        );

        CREATE TABLE IF NOT EXISTS reservas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            livro_id INTEGER,
            data_reserva TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'pendente',
            UNIQUE(user_id, livro_id)
        );

        CREATE TABLE IF NOT EXISTS participacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            evento_id INTEGER,
            data_registro TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, evento_id)
        );
    `);

    const totalUsers = db.prepare("SELECT COUNT(*) AS total FROM users").get() as { total: number };

    if (!totalUsers.total) {
        db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)")
            .run("Administrador Nook", "admin@nook.com", bcrypt.hashSync("admin123", 10), "admin");

        db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)")
            .run("Cliente Demo", "cliente@nook.com", bcrypt.hashSync("cliente123", 10), "cliente");

        db.prepare("INSERT INTO livros (titulo, autor, ano, quantidade, capa) VALUES (?, ?, ?, ?, ?)")
            .run("Memórias Póstumas de Brás Cubas", "Machado de Assis", 1881, 4, "");

        db.prepare("INSERT INTO livros (titulo, autor, ano, quantidade, capa) VALUES (?, ?, ?, ?, ?)")
            .run("A Hora da Estrela", "Clarice Lispector", 1977, 3, "");

        db.prepare("INSERT INTO eventos (titulo, descricao, data, horario, local, vagas, banner) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run("Clube de Leitura", "Encontro mensal para leitores da comunidade.", "2026-07-12", "19:00", "Nook Cafeteria e Sebo", 25, "");

        db.prepare("INSERT INTO eventos (titulo, descricao, data, horario, local, vagas, banner) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run("Feira de Troca de Livros", "Traga um livro e leve novas histórias para casa.", "2026-07-20", "16:00", "Área externa da Nook", 40, "");
    }
}

init();

function flash(request: any, msg: string, type = "ok") {
    request.session.flash = { msg, type };
}

function adminOnly(request: any, response: any, next: any) {
    if (request.session.user?.role === "admin") {
        return next();
    }

    return response.redirect("/login");
}

function logged(request: any, response: any, next: any) {
    if (request.session.user) {
        return next();
    }

    return response.redirect("/login");
}

function slugifyBook(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function bookCover(book: any = {}) {
    if (book.capa) {
        return `/uploads/${book.capa}`;
    }

    const known: Record<string, string> = {
        "memorias-postumas-de-bras-cubas": "/img/covers/memorias-postumas-de-bras-cubas.svg",
        "a-hora-da-estrela": "/img/covers/a-hora-da-estrela.svg"
    };

    return known[slugifyBook(book.titulo)] || "/img/covers/default-book.svg";
}

app.use((request: any, response: any, next: any) => {
    response.locals.user = request.session.user;
    response.locals.flash = request.session.flash;
    response.locals.bookCover = bookCover;
    delete request.session.flash;
    next();
});

app.get("/", (_, response) => {
    const livros = db.prepare("SELECT * FROM livros ORDER BY id DESC LIMIT 6").all();
    const eventos = db.prepare("SELECT * FROM eventos ORDER BY data ASC LIMIT 6").all();

    response.render("home", { livros, eventos });
});

app.get("/login", (_, response) => {
    response.render("login");
});

app.post("/login", (request: any, response) => {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(request.body.email) as any;

    if (!user || !bcrypt.compareSync(request.body.password, user.password)) {
        flash(request, "Usuário ou senha inválidos.", "error");
        return response.redirect("/login");
    }

    request.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
    };

    return response.redirect(user.role === "admin" ? "/admin" : "/catalogo");
});

app.post("/logout", (request: any, response) => {
    request.session.destroy(() => response.redirect("/"));
});

app.get("/catalogo", (request, response) => {
    const q = String(request.query.q || "");
    const livros = db.prepare("SELECT * FROM livros WHERE titulo LIKE ? OR autor LIKE ? ORDER BY titulo").all(`%${q}%`, `%${q}%`);

    response.render("catalogo", { livros, q });
});

app.post("/reservas/:id", logged, (request: any, response) => {
    const livro = db.prepare("SELECT * FROM livros WHERE id = ?").get(request.params.id) as any;

    if (!livro || livro.quantidade < 1) {
        flash(request, "Livro indisponível.", "error");
        return response.redirect("/catalogo");
    }

    try {
        db.prepare("INSERT INTO reservas (user_id, livro_id) VALUES (?, ?)").run(request.session.user.id, request.params.id);
        db.prepare("UPDATE livros SET quantidade = quantidade - 1 WHERE id = ?").run(request.params.id);
        flash(request, "Reserva realizada com sucesso.");
    } catch {
        flash(request, "Você já reservou este livro.", "error");
    }

    return response.redirect("/minhas-reservas");
});

app.get("/minhas-reservas", logged, (request: any, response) => {
    const reservas = db.prepare(`
        SELECT r.*, l.titulo, l.autor
        FROM reservas r
        JOIN livros l ON l.id = r.livro_id
        WHERE r.user_id = ?
        ORDER BY r.id DESC
    `).all(request.session.user.id);

    response.render("reservas", { reservas });
});

app.post("/reservas/:id/cancelar", logged, (request: any, response) => {
    const reserva = db.prepare("SELECT * FROM reservas WHERE id = ? AND user_id = ?").get(request.params.id, request.session.user.id) as any;

    if (reserva && reserva.status === "pendente") {
        db.prepare("UPDATE reservas SET status = 'cancelada' WHERE id = ?").run(reserva.id);
        db.prepare("UPDATE livros SET quantidade = quantidade + 1 WHERE id = ?").run(reserva.livro_id);
        flash(request, "Reserva cancelada.");
    }

    response.redirect("/minhas-reservas");
});

app.get("/eventos", (_, response) => {
    const eventos = db.prepare("SELECT * FROM eventos ORDER BY data ASC").all();
    response.render("eventos", { eventos });
});

app.post("/eventos/:id/participar", logged, (request: any, response) => {
    const evento = db.prepare(`
        SELECT e.*, (
            SELECT COUNT(*)
            FROM participacoes p
            WHERE p.evento_id = e.id
        ) AS inscritos
        FROM eventos e
        WHERE id = ?
    `).get(request.params.id) as any;

    if (!evento || evento.inscritos >= evento.vagas) {
        flash(request, "Evento sem vagas disponíveis.", "error");
        return response.redirect("/eventos");
    }

    try {
        db.prepare("INSERT INTO participacoes (user_id, evento_id) VALUES (?, ?)").run(request.session.user.id, request.params.id);
        flash(request, "Participação registrada.");
    } catch {
        flash(request, "Você já está inscrito neste evento.", "error");
    }

    return response.redirect("/eventos");
});

app.get("/admin", adminOnly, (_, response) => {
    const stats = {
        livros: (db.prepare("SELECT COUNT(*) AS total FROM livros").get() as any).total,
        eventos: (db.prepare("SELECT COUNT(*) AS total FROM eventos").get() as any).total,
        clientes: (db.prepare("SELECT COUNT(*) AS total FROM clientes").get() as any).total,
        reservas: (db.prepare("SELECT COUNT(*) AS total FROM reservas").get() as any).total
    };

    response.render("admin/dashboard", { stats });
});

type Field = {
    name: string;
    label: string;
    type?: string;
};

function crud(name: string, table: string, fields: Field[], uploadField?: string) {
    app.get(`/admin/${name}`, adminOnly, (_, response) => {
        const rows = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all();
        response.render("admin/list", { name, table, fields, rows });
    });

    app.get(`/admin/${name}/novo`, adminOnly, (_, response) => {
        response.render("admin/form", {
            name,
            fields,
            row: {},
            action: `/admin/${name}`,
            method: "POST"
        });
    });

    app.post(`/admin/${name}`, adminOnly, upload.single(uploadField || "image"), (request: any, response) => {
        const data = fields.map((field) => {
            if (request.file && field.name === uploadField) {
                return request.file.filename;
            }

            return request.body[field.name] || "";
        });

        db.prepare(`INSERT INTO ${table} (${fields.map((field) => field.name).join(",")}) VALUES (${fields.map(() => "?").join(",")})`).run(...data);
        flash(request, "Cadastro salvo.");
        response.redirect(`/admin/${name}`);
    });

    app.get(`/admin/${name}/:id/editar`, adminOnly, (request, response) => {
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(request.params.id);

        response.render("admin/form", {
            name,
            fields,
            row,
            action: `/admin/${name}/${request.params.id}?_method=PUT`,
            method: "POST"
        });
    });

    app.put(`/admin/${name}/:id`, adminOnly, upload.single(uploadField || "image"), (request: any, response) => {
        const current = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(request.params.id) as any;
        const data = fields.map((field) => {
            if (request.file && field.name === uploadField) {
                return request.file.filename;
            }

            return request.body[field.name] || current[field.name] || "";
        });

        db.prepare(`UPDATE ${table} SET ${fields.map((field) => `${field.name} = ?`).join(",")} WHERE id = ?`).run(...data, request.params.id);
        flash(request, "Registro atualizado.");
        response.redirect(`/admin/${name}`);
    });

    app.delete(`/admin/${name}/:id`, adminOnly, (request: any, response) => {
        db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(request.params.id);
        flash(request, "Registro excluído.");
        response.redirect(`/admin/${name}`);
    });
}

crud("livros", "livros", [
    { name: "titulo", label: "Título" },
    { name: "autor", label: "Autor" },
    { name: "ano", label: "Ano", type: "number" },
    { name: "quantidade", label: "Quantidade", type: "number" },
    { name: "capa", label: "Capa", type: "file" }
], "capa");

crud("eventos", "eventos", [
    { name: "titulo", label: "Título" },
    { name: "descricao", label: "Descrição", type: "textarea" },
    { name: "data", label: "Data", type: "date" },
    { name: "horario", label: "Horário", type: "time" },
    { name: "local", label: "Local" },
    { name: "vagas", label: "Vagas", type: "number" },
    { name: "banner", label: "Banner", type: "file" }
], "banner");

crud("clientes", "clientes", [
    { name: "nome", label: "Nome" },
    { name: "cpf", label: "CPF" },
    { name: "email", label: "E-mail" },
    { name: "telefone", label: "Telefone" },
    { name: "endereco", label: "Endereço" }
]);

crud("funcionarios", "funcionarios", [
    { name: "nome", label: "Nome" },
    { name: "cpf", label: "CPF" },
    { name: "email", label: "E-mail" },
    { name: "telefone", label: "Telefone" },
    { name: "funcao", label: "Função" }
]);

app.listen(port, () => {
    console.log(`Web server running in http://localhost:${port}`);
});
