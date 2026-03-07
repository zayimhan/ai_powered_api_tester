const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'apiflow-secret-key-2026';

function register(db, { username, email, password }) {
    const password_hash = bcrypt.hashSync(password, 10);
    const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
    const info = stmt.run(username, email, password_hash);
    return { id: Number(info.lastInsertRowid), username, email };
}

function login(db, { email, password }) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        throw new Error('Invalid email or password');
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
    );

    return {
        token,
        user: { id: user.id, username: user.username, email: user.email }
    };
}

module.exports = { register, login };
