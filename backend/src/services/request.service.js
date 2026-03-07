// Saved request CRUD operations against the database

function getAll(db, userId) {
    const stmt = db.prepare('SELECT * FROM saved_requests WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(Number(userId));
}

function create(db, data, userId) {
    const { collection_id, name, description, method, url, query_params, headers, body, body_type } = data;
    const stmt = db.prepare(`
        INSERT INTO saved_requests 
        (collection_id, name, description, method, url, query_params, headers, body, body_type, user_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
        collection_id ?? null,
        name ?? null,
        description ?? null,
        method ?? null,
        url ?? null,
        JSON.stringify(query_params || {}),
        JSON.stringify(headers || {}),
        body ?? null,
        body_type || 'none',
        Number(userId)
    );
    return { id: Number(info.lastInsertRowid), ...data, user_id: userId };
}

function getById(db, id, userId) {
    const stmt = db.prepare('SELECT * FROM saved_requests WHERE id = ? AND user_id = ?');
    const request = stmt.get(Number(id), Number(userId));
    if (request) {
        request.query_params = JSON.parse(request.query_params || '{}');
        request.headers = JSON.parse(request.headers || '{}');
    }
    return request;
}

function update(db, id, data, userId) {
    const { collection_id, name, description, method, url, query_params, headers, body, body_type } = data;
    const stmt = db.prepare(`
        UPDATE saved_requests 
        SET collection_id = ?, name = ?, description = ?, method = ?, url = ?, 
            query_params = ?, headers = ?, body = ?, body_type = ?, updated_at = datetime('now') 
        WHERE id = ? AND user_id = ?
    `);
    stmt.run(
        collection_id ?? null,
        name ?? null,
        description ?? null,
        method ?? null,
        url ?? null,
        JSON.stringify(query_params || {}),
        JSON.stringify(headers || {}),
        body ?? null,
        body_type || 'none',
        Number(id),
        Number(userId)
    );
    return getById(db, id, userId);
}

function remove(db, id, userId) {
    const stmt = db.prepare('DELETE FROM saved_requests WHERE id = ? AND user_id = ?');
    stmt.run(Number(id), Number(userId));
    return { success: true };
}

function getByCollection(db, collectionId, userId) {
    const stmt = db.prepare('SELECT * FROM saved_requests WHERE collection_id = ? AND user_id = ? ORDER BY created_at DESC');
    return stmt.all(Number(collectionId), Number(userId)).map(req => {
        req.query_params = JSON.parse(req.query_params || '{}');
        req.headers = JSON.parse(req.headers || '{}');
        return req;
    });
}

module.exports = { getAll, create, getById, update, remove, getByCollection };
