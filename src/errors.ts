export type DropiErrorCode =
    | 'HTTP_ERROR' | 'API_ERROR' | 'PROTOCOL_ERROR' | 'TRANSPORT_ERROR'
    | 'TIMEOUT' | 'ABORTED' | 'RESPONSE_TOO_LARGE' | 'PAGINATION_LIMIT';

/** not-sent proves no transport invocation; unknown follows an unconfirmed attempt. */
export type MutationOutcome = 'not-applicable' | 'not-sent' | 'unknown' | 'rejected';

export interface DropiErrorDetails {
    code: DropiErrorCode;
    method: string;
    path: string;
    /** Transport invocations started; does not prove provider receipt. */
    attempts: number;
    mutationOutcome: MutationOutcome;
    status?: number;
    retryAfterMs?: number;
}

/** Safe metadata only: no provider body, key, request payload or original exception cause. */
export class DropiError extends Error {
    readonly code: DropiErrorCode;
    readonly method: string;
    readonly path: string;
    readonly attempts: number;
    readonly mutationOutcome: MutationOutcome;
    readonly status: number | undefined;
    readonly retryAfterMs: number | undefined;

    constructor(details: DropiErrorDetails) {
        super(`${details.method} ${details.path} failed: ${details.code}${details.status === undefined ? '' : ` (HTTP ${details.status})`}`);
        this.name = 'DropiError';
        this.code = details.code;
        this.method = details.method;
        this.path = details.path;
        this.attempts = details.attempts;
        this.mutationOutcome = details.mutationOutcome;
        this.status = details.status;
        this.retryAfterMs = details.retryAfterMs;
    }
}
