export interface User {
    id: number;
    username: string;
    email: string;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface Collection {
    id: number;
    name: string;
    user_id?: number;
    created_at?: string;
}

export interface SavedRequest {
    id: number;
    collection_id: number;
    name: string;
    title?: string;
    method: string;
    url: string;
    headers?: string;
    query_params?: string;
    body?: string | null;
    body_type?: string;
    created_at?: string;
}

export interface ExecutionPayload {
    method: string;
    url: string;
    headers: Record<string, string>;
    query_params: Record<string, string>;
    body: string | null;
    body_type: string;
}

export interface ExecutionResult {
    success: boolean;
    status_code: number;
    response_body?: string;
    response_headers?: Record<string, string>;
    response_time_ms?: number;
    error_message?: string;
    executed_at?: string;
}

export interface HistoryItem {
    id: number;
    method: string;
    url: string;
    status_code: number;
    response_time_ms?: number;
    request_body?: string;
    body_type?: string;
    executed_at: string;
}

export interface KeyValuePair {
    key: string;
    value: string;
}
