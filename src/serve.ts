/** 
 *  Wip ...
 * */
export type ServeStaticFileInfos = {

    pathname : string
    size     : number
    mtime    : Date | null
    atime    : Date | null

}

/** 
 *  Wip ...
 * */
export type ServeStaticOptions = Partial<{

    /** 
     *  Wip ...
     * */
    generateFilename: (
        req: Request
    ) => string

    /** 
     *  Wip ...
     * */
    generateETag: (
        desc: ServeStaticFileInfos, req: Request
    ) => string | Promise<string>

    /** 
     *  Wip ...
     * */
    generateContentType: (
        desc: ServeStaticFileInfos, req: Request
    ) => string

}>

/** 
 *  Wip ...
 * */
export type ServeStaticHandler 
    = (req: Request) => Promise<Response>

/** 
 *  Wip ...
 * */
export type ServeStaticFactory 
    = (options?: ServeStaticOptions) => ServeStaticHandler

const enum Status {

    OK                    = 200,
    NO_CONTENT            = 204,
    PARTIAL_CONTENT       = 206,
    NOT_MODIFIED          = 304,
    BAD_REQUEST           = 400,
    NOT_FOUND             = 404,
    METHOD_NOT_ALLOWED    = 405,
    PRECONDITION_FAILED   = 412,
    RANGE_NOT_SATISFIABLE = 416,

}

const enum Method {

    GET     = `GET`,
    OPTIONS = `OPTIONS`,
    HEAD    = `HEAD`,

}

const enum HeaderName {

    ALLOW               = `Allow`,
    VARY                = `Vary`,
    CONTENT_TYPE        = `Content-Type`,
    CONTENT_LENGTH      = `Content-Length`,
    CONTENT_RANGE       = `Content-Range`,
    ACCEPT_RANGES       = `Accept-Ranges`,
    LAST_MODIFIED       = `Last-Modified`,
    RANGE               = `Range`,
    ETAG                = `ETag`,
    IF_MODIFIED_SINCE   = `If-Modified-Since`,
    IF_UNMODIFIED_SINCE = `If-Unmodified-Since`,
    IF_MATCH            = `If-Match`,
    IF_NONE_MATCH       = `If-None-Match`,
    IF_RANGE            = `If-Range`,

}

const enum AcceptRangeUnit {

    NONE  = `none`  ,
    BYTES = `bytes` ,

}

type Nullable<T> = T | null | undefined

type Part = {
    start : number
    end   : number
    count : number
}

/** @see https://www.rfc-editor.org/rfc/rfc9110#name-comparison-2 */
function matchEtag(
    reqHeader: string, etag: string, acceptWeakness = !1
) : boolean {

    if (etag.startsWith(`W/`)) {

        if (acceptWeakness) {
            etag = etag.substring(2)
        } else {
            return !1
        }

    }

    if (reqHeader == `*`) {
        return !0
    }

    for (let x of reqHeader.split(`,`)) {

        x = x.trim()

        if (x.startsWith(`W/`)) {

            if (acceptWeakness) {
                x = x.substring(2)
            } else {
                continue
            }

        }

        if (x == etag) {
            return !0
        }

    }

    return !1

}

function testPreconditionFailed(
    headers : Headers, e : Nullable<string>, t : Nullable<number>
) : boolean {

    let s

    if (e && (s = headers.get(HeaderName.IF_MATCH))) {
        return !matchEtag(s, e)
    }
    
    // Note : if `s` is invalid -> `t <> Date.parse(s)` always return false
    if (t && (s = headers.get(HeaderName.IF_UNMODIFIED_SINCE))) {
        return t > Date.parse(s)
    }

    return !1

}

function testNotModified(
    headers: Headers, e : Nullable<string>, t : Nullable<number>
) : boolean {

    let s

    if (e && (s = headers.get(HeaderName.IF_NONE_MATCH))) {
        return matchEtag(s, e, true)
    }
    
    // Note : if `s` is invalid -> `t <> Date.parse(s)` always return false
    if (t && (s = headers.get(HeaderName.IF_MODIFIED_SINCE))) {
        return t <= Date.parse(s)
    }

    return !1

}

function testConditionalRange(
    headers: Headers, e : Nullable<string>, t : Nullable<number>
) : boolean {

    if (!headers.has(HeaderName.RANGE)) {
        return !1
    }

    const s = headers.get(HeaderName.IF_RANGE)

    if (!s) {
        return !0
    }

    // We assume it is a Date
    if (s.endsWith(` GMT`)) {
        return t ? t <= Date.parse(s) : !0
    }

    // otherwise -> it is an etag
    return e ? 
        !( s.startsWith(`W/`) 
        || e.startsWith(`W/`) 
        || e != s ) : !0

}

/** @see https://www.rfc-editor.org/rfc/rfc9110#name-precedence-of-preconditions */
function evaluatePreconds(
    req: Request, etag : Nullable<string>, date : Nullable<Date>
) : | Status.OK
    | Status.PARTIAL_CONTENT
    | Status.NOT_MODIFIED
    | Status.PRECONDITION_FAILED {

    const {
        headers
    } = req

    if (!etag && !date) {

        return headers.has(HeaderName.RANGE) 
             ? Status.PARTIAL_CONTENT 
             : Status.OK
             
    }

    const time 
        = date 
        ? date.getTime() - date.getMilliseconds()
        : 0

    if (testPreconditionFailed(headers, etag, time)) {
        return Status.PRECONDITION_FAILED
    }

    if (testNotModified(headers, etag, time)) {
        return Status.NOT_MODIFIED
    }

    if (req.method == Method.GET && testConditionalRange(headers, etag, time)) {
        return Status.PARTIAL_CONTENT
    }

    return Status.OK

}

/** @see https://www.rfc-editor.org/rfc/rfc9110#name-range-specifiers */
function computeRangeHeader(
    headerValue: string, maxSizeBytes: number
) : Part[] {

    if (!headerValue.startsWith(AcceptRangeUnit.BYTES + `=`)) {
        return []
    }

    const o = [
        // ...
    ] as Part[]

    for (const r of headerValue.substring(6).split(`,`)) {

        // Note : do not support `other-range`
        if (!/^\s*\d*\-\d*\s*$/.test(r)) {
            return []
        }

        let [
            a,
            b,
        ] = r.split(`-`, 2).map((x) => parseInt(x))

        if (isNaN(a) && isNaN(b)) {
            return []
        } else if (isNaN(a)) {
            a = maxSizeBytes - b
            b = maxSizeBytes - 1
        } else if (isNaN(b)) {
            b = maxSizeBytes - 1
        }

        if (a < 0 || b < 0 || a > b || b > maxSizeBytes - 1) {
            return []
        }

        o.push({
            start: a,
            end: b,
            count: b - a + 1,
        })

    }

    return o

}

function createSlicedStream(
    cursor: Deno.Seeker, start: number, count: number
) : TransformStream<Uint8Array, Uint8Array> {

    function transform(
        chunk: Uint8Array, e: TransformStreamDefaultController<Uint8Array>,
    ) {

        const {
            byteLength: s,
        } = chunk

        count -= s

        if (count > 0) {
            return e.enqueue(chunk)
        }

        count += s
        count && e.enqueue(chunk.slice(0, count))

        return e.terminate()

    }

    return new TransformStream({
        transform, async start() { await cursor.seek(start, Deno.SeekMode.Start) }
    })

}

const EOL_ENCODED = new Uint8Array([0x0D, 0x0A])

/** @see https://www.rfc-editor.org/rfc/rfc9110#name-media-type-multipart-bytera */
function createMultipartBytesStream(
    cursor: Deno.Seeker, size: number, contentType: Nullable<string>, parts: Part[], boundary: string
) : TransformStream<Uint8Array, Uint8Array> {

    const enc = new TextEncoder()

    let start = 0
    let end   = 0
    let count = 0

    let head = `--${boundary}\r\n`

    if (contentType) {
        head += `${HeaderName.CONTENT_TYPE}: ${contentType}\r\n`
    }

    const HEAD_FRAG_ENCODED = enc.encode(
        `${head}${HeaderName.CONTENT_RANGE}: ${AcceptRangeUnit.BYTES} `,
    )

    function next(
        e: TransformStreamDefaultController<Uint8Array>,
    ) {

        const r = parts.shift()

        if (!r) {
            // End of response body
            e.enqueue(enc.encode(
                `--${boundary}--`,
            ))

            return e.terminate()
        }

        start = r.start
        end   = r.end
        count = r.count

        // Start entity body
        e.enqueue(HEAD_FRAG_ENCODED)

        // Content-Range: bytes `${start}-${end}/${size}`
        e.enqueue(enc.encode(
            `${start}-${end}/${size}`,
        ))

        e.enqueue(EOL_ENCODED)
        e.enqueue(EOL_ENCODED)

        return cursor.seek(start, Deno.SeekMode.Start).then(() => {
            return
        })

    }

    function transform(
        chunk: Uint8Array, e: TransformStreamDefaultController<Uint8Array>,
    ) {

        const {
            byteLength: s,
        } = chunk

        count -= s

        if (count > 0) {
            return e.enqueue(chunk)
        }

        count += s
        count && e.enqueue(chunk.slice(0, count))

        // End of entity body
        e.enqueue(EOL_ENCODED)

        return next(e)

    }

    return new TransformStream({ start: next, transform })

}

function createBoundary(
    size = 20,
    base = 36,
) : string {

    let o = ``

    // Just in case
    if (base > 36 || base < 2) {
        base = 36
    }

    while (size-- > 0) {
        o += (base * Math.random() | 0).toString(base)
    }

    return o

}

function generateLocalFilename(
    req: Request
) : string {

    return new URL(req.url).pathname.substring(1)

}

function generateTrivialETag({
    mtime , size
}: ServeStaticFileInfos) {

    return mtime ? `W/"${mtime.getTime().toString(36)}:${size.toString(36)}"` : ``

}

const commonHeaders = [
    [HeaderName.ALLOW, `${Method.GET}, ${Method.OPTIONS}, ${Method.HEAD}`],
    [HeaderName.ACCEPT_RANGES, `${AcceptRangeUnit.BYTES}`],
]

/** Wip */
export const serveStatic: ServeStaticFactory = ({
    generateFilename = generateLocalFilename, generateETag = generateTrivialETag, generateContentType
} = {}) => {

    return async req => {

        const headers = new Headers(commonHeaders)
        const {
            method,
        } = req
    
        // If `OPTIONS` -> only send basic headers
        if (method == Method.OPTIONS) {

            return new Response(void 0, {
                status: Status.NO_CONTENT, headers,
            })
    
        }
    
        if (
            method != Method.GET &&
            method != Method.HEAD
        ) {

            return new Response(void 0, {
                status: Status.METHOD_NOT_ALLOWED, headers,
            })
    
        }
    
        // Prevent bad formated URL
        if (!req.url || !URL.canParse(req.url)) {

            return new Response(void 0, {
                status: Status.BAD_REQUEST, headers,
            })

        }

        const pathname 
            = generateFilename(req)

        let stat ; try {
            stat = await Deno.stat(pathname)
        } catch {

            return new Response(void 0, {
                status: Status.NOT_FOUND, headers,
            })

        }
        
        if (stat.isDirectory) {
        
            return new Response(void 0, {
                status: Status.NOT_FOUND, headers,
            })
    
        }

        const {
            size, mtime, atime
        } = stat
        
        const etag = await generateETag({
            pathname, size, mtime, atime
        } , req)

        if (etag) {
            headers.set(HeaderName.ETAG, etag)
            headers.set(HeaderName.VARY, HeaderName.ETAG)
        }

        if (mtime) {
            headers.set(HeaderName.LAST_MODIFIED, mtime.toUTCString())
        }

        const status = evaluatePreconds(req, etag, mtime)
    
        if (
            status != Status.OK &&
            status != Status.PARTIAL_CONTENT
        ) {
    
            // Note : MUST be `null` or `undefined`
            return new Response(void 0, {
                status, headers,
            })
    
        }

        const contentType = generateContentType?.({
            pathname, size, mtime, atime
        } , req)
    
        // if `HEAD` or empty body -> send headers only & ignore the `Range` header
        if (method == Method.HEAD || size <= 0) {
    
            contentType &&
            headers.set(HeaderName.CONTENT_TYPE, `${contentType}`)
            headers.set(HeaderName.CONTENT_LENGTH, `${size}`)

            return new Response(void 0, {
                status: Status.OK, headers,
            })
    
        }
    
        if (status == Status.OK) {
    
            contentType &&
            headers.set(HeaderName.CONTENT_TYPE, `${contentType}`)
            headers.set(HeaderName.CONTENT_LENGTH, `${size}`)

            // send streamed 200 response
            return new Response((await Deno.open(pathname)).readable, {
                status, headers
            })
    
        }
    
        const computeds = computeRangeHeader(
            req.headers.get(HeaderName.RANGE)!, size,
        )
    
        // Note : `computeds` MUST be a non empty Array
        if (computeds.length == 0) {
    
            headers.set(HeaderName.CONTENT_RANGE,
                `${AcceptRangeUnit.BYTES} */${size}`
            )
    
            headers.delete(HeaderName.LAST_MODIFIED)
            headers.delete(HeaderName.VARY)
            headers.delete(HeaderName.ETAG)
    
            return new Response(void 0, {
                status: Status.RANGE_NOT_SATISFIABLE, headers,
            })
    
        }
    
        // more than 1 range -> multipart/byteranges
        if (computeds.length > 1) {

            const boundary = createBoundary()
            const file     = await Deno.open(pathname)
            const init     = {
                status, headers
            }
    
            headers.set(HeaderName.CONTENT_TYPE,
                `multipart/byteranges boundary=${boundary}`
            )

            // Note : No need to precompute the `Content-Length`
            return new Response(
                file.readable.pipeThrough(
                    createMultipartBytesStream(
                        file, 
                        size, 
                        contentType, 
                        computeds, 
                        boundary
                    )
                ), 
                init
            )
    
        }

        const {
            start, end, count
        } = computeds[0]!
    
        contentType &&
        headers.set(HeaderName.CONTENT_TYPE, `${contentType}`)
        headers.set(HeaderName.CONTENT_LENGTH, `${count}`)
        headers.set(HeaderName.CONTENT_RANGE, `${AcceptRangeUnit.BYTES} ${start}-${end}/${size}`)
    
        const file = await Deno.open(pathname)
        const init = {
            status, headers
        }

        return new Response(
            file.readable.pipeThrough(
                createSlicedStream(file, start, count)
            ), 
            init
        )
    
    } 

}