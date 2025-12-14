const API_BASE = 'tables';

// Simple UUID generator to ensure unique IDs
function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function handleResponse(res) {
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error: ${res.status} ${text}`);
    }
    // Check if content-length is > 0 or content-type is json
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await res.json();
    }
    return null; // For 204 No Content
}

const api = {
    // Users API
    users: {
        list: async () => {
            const res = await fetch(`${API_BASE}/users?limit=100&_t=${Date.now()}`);
            return await handleResponse(res);
        },
        get: async (id) => {
            const res = await fetch(`${API_BASE}/users/${id}?_t=${Date.now()}`);
            return await handleResponse(res);
        },
        create: async (data) => {
            const res = await fetch(`${API_BASE}/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await handleResponse(res);
        },
        update: async (id, data) => {
            const res = await fetch(`${API_BASE}/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await handleResponse(res);
        },
        delete: async (id) => {
            const res = await fetch(`${API_BASE}/users/${id}`, {
                method: 'DELETE'
            });
            return await handleResponse(res);
        }
    },

    // Tasks API
    tasks: {
        list: async (params = {}) => {
            const query = new URLSearchParams({
                limit: 100,
                sort: 'due_date',
                _t: Date.now(),
                ...params
            }).toString();
            const res = await fetch(`${API_BASE}/tasks?${query}`);
            return await handleResponse(res);
        },
        create: async (data) => {
            const res = await fetch(`${API_BASE}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await handleResponse(res);
        },
        update: async (id, data) => {
            const res = await fetch(`${API_BASE}/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            return await handleResponse(res);
        },
        delete: async (id) => {
            const res = await fetch(`${API_BASE}/tasks/${id}`, {
                method: 'DELETE'
            });
            return await handleResponse(res);
        }
    },

    // Comments API
    comments: {
        list: async () => {
            const res = await fetch(`${API_BASE}/comments?sort=-created_at&limit=50&_t=${Date.now()}`);
            return await handleResponse(res);
        },
        create: async (data) => {
            const res = await fetch(`${API_BASE}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...data,
                    created_at: new Date().toISOString()
                })
            });
            return await handleResponse(res);
        },
        delete: async (id) => {
            const res = await fetch(`${API_BASE}/comments/${id}`, {
                method: 'DELETE'
            });
            return await handleResponse(res);
        }
    }
};