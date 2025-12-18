export interface PrettyDecodeContext {
    blobs: Map<string, Buffer>;
    nextBlobId: number;
}

export function createPrettyDecodeContext(): PrettyDecodeContext {
    return {
        blobs: new Map<string, Buffer>(),
        nextBlobId: 1
    };
}

export function registerBlob(ctx: PrettyDecodeContext, bytes: Buffer): string {
    const id = `blob-${ctx.nextBlobId++}`;
    ctx.blobs.set(id, bytes);
    return id;
}
