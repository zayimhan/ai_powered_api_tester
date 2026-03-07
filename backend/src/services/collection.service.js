// Collection CRUD operations
// Basic CRUD for collections

function getAll(db, userId) {
    const stmt = db.prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(Number(userId));
}

function create(db, data, userId) {
    const { name, description } = data;
    const stmt = db.prepare('INSERT INTO collections (name, description, user_id) VALUES (?, ?, ?)');
    const info = stmt.run(name ?? null, description ?? null, Number(userId));
    return { id: Number(info.lastInsertRowid), name, description, user_id: userId };
}

function getById(db, id, userId) {
    const stmt = db.prepare('SELECT * FROM collections WHERE id = ? AND user_id = ?');
    return stmt.get(Number(id), Number(userId));
}

function update(db, id, data, userId) {
    const { name, description } = data;
    const stmt = db.prepare('UPDATE collections SET name = ?, description = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?');
    stmt.run(name ?? null, description ?? null, Number(id), Number(userId));
    return getById(db, id, userId);
}

function remove(db, id, userId) {
    const stmt = db.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?');
    stmt.run(Number(id), Number(userId));
    return { success: true };
}

module.exports = { getAll, create, getById, update, remove };
