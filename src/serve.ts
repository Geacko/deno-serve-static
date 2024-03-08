import * as Mime from "@geacko/mimes"

export type ServeStaticOptions = Partial<{

    /**
     *  Rewrite the pathname of the
     *  request URI. The output pathname
     *  MUST start with "/".
     */
    rewrite: (pathnme: string, req: Request) => string

}>

/** Wip */
export type ServeStaticHandler = (
    req: Request
) => Response | Promise<Response>

/** Wip */
export type ServeStaticFactory = (
    options: ServeStaticOptions
) => ServeStaticHandler

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

const enum Allowed {

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

type Part = {
    start : number
    end   : number
    count : number
}

/** @see https://www.rfc-editor.org/rfc/rfc9110#name-comparison-2 */
function matchEtag(
    reqHeader: string, etag: string, acceptWeakness = !1
) {

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

/** @see https://www.rfc-editor.org/rfc/rfc9110#name-precedence-of-preconditions */
function evaluatePreconds(
    req: Request, preconds: PrecondHeaders | undefined
) : | Status.OK
    | Status.PARTIAL_CONTENT
    | Status.NOT_MODIFIED
    | Status.PRECONDITION_FAILED {

    const isRanged = req.headers.has(HeaderName.RANGE)

    if (!preconds) {
        return isRanged ? Status.PARTIAL_CONTENT : Status.OK
    }

    const {
        headers,
    } = req

    const {
        [HeaderName.ETAG]: e,
        [HeaderName.LAST_MODIFIED]: d,
    } = preconds

    const t = Date.parse(d)

    // header content
    let s

    // Check `If-Match` condition
    if ((s = headers.get(HeaderName.IF_MATCH))) {

        // Note : if `e` is Weak -> always return false
        if (!matchEtag(s, e)) {
            return Status.PRECONDITION_FAILED
        }

    }

    // Check `If-Unmodified-Since` condition
    else if ((s = headers.get(HeaderName.IF_UNMODIFIED_SINCE))) {

        // Note : if `s` is invalid -> `t > Date.parse(s)` always return false
        if (t > Date.parse(s)) {
            return Status.PRECONDITION_FAILED
        }

    }

    // Check `If-None-Match` condition
    if ((s = headers.get(HeaderName.IF_NONE_MATCH))) {

        if (matchEtag(s, e, true)) {
            return Status.NOT_MODIFIED
        }

    }

    // Check `If-Modified-Since` condition
    else if ((s = headers.get(HeaderName.IF_MODIFIED_SINCE))) {

        // Note : if `s` is invalid -> `t <= Date.parse(s)` always return false
        if (t <= Date.parse(s)) {
            return Status.NOT_MODIFIED
        }

    }

    // Note : If is `HEAD` -> we ignore the `Range` header
    if (req.method == Allowed.HEAD || !isRanged) {
        return Status.OK
    }

    // Check `If-Range` condition
    if ((s = headers.get(HeaderName.IF_RANGE))) {

        // We assume is a Date
        if (s.endsWith(` GMT`)) {

            // Note : if `s` is invalid -> `t > Date.parse(s)` always return false
            if (t > Date.parse(s)) {
                return Status.OK
            }

        }

        // Otherwise -> Etag (Weakness not allowed here...)
        else if (!s.startsWith(`W/`) && e != s) {
            return Status.OK
        }

    }

    return Status.PARTIAL_CONTENT

}

function createEtag(
    ...xs: number[]
) {

    return `W/"${xs.map((x) => x.toString(36)).join(`.`)}"`

}

type PrecondHeaders = {
    [HeaderName.LAST_MODIFIED] : string
    [HeaderName.ETAG]          : string
    [HeaderName.VARY]          : string
}

function computePrecondHeaders(
    stat: Deno.FileInfo
) : PrecondHeaders | undefined {

    const {
        mtime: time,
    } = stat

    // ensure `mtime` is a valid Date
    if (!time || !isFinite(time.getTime())) {
        return void 0
    }

    const {
        size,
    } = stat

    const date = time.toUTCString()

    // Note : We re-parse `date` for consistency
    const etag = createEtag(size, Date.parse(date))

    return {
        [HeaderName.LAST_MODIFIED]: date,
        [HeaderName.ETAG]: etag,
        [HeaderName.VARY]: HeaderName.ETAG,
    }

}

function createContentTypeFromPathname(
    pathname: string
) : string {

    const mime = Mime.lookup(pathname.match(/\.([A-Z0-9]+)$/i)?.[1] ?? ``)

    if (mime) {
        return mime.isUtf8
             ? mime.type + ` charset=UTF-8`
             : mime.type
    }

    return ``

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
    cursor: Deno.Seeker, size: number, contentType: string, parts: Part[], boundary: string
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

    return new TransformStream({
        start: next, transform,
    })

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

const commonHeaders = [
    [HeaderName.ALLOW, `${Allowed.GET}, ${Allowed.OPTIONS}, ${Allowed.HEAD}`],
    [HeaderName.ACCEPT_RANGES, `${AcceptRangeUnit.BYTES}`],
]

/** Wip */
export const serveStatic: ServeStaticFactory = ({ rewrite = x => x } = {}) => async req => {

    const headers = new Headers(commonHeaders)
    const {
        method,
    } = req

    // If `OPTIONS` -> only send basic headers
    if (method == Allowed.OPTIONS) {

        return new Response(void 0, {
            status: Status.NO_CONTENT, headers,
        })

    }

    if (
        method != Allowed.GET &&
        method != Allowed.HEAD
    ) {

        return new Response(void 0, {
            status: Status.METHOD_NOT_ALLOWED, headers,
        })

    }

    let pathname

    // Prevent bad formated URL
    try {
        pathname = `.` + rewrite(new URL(req.url).pathname, req)
    } catch {

        return new Response(void 0, {
            status: Status.BAD_REQUEST, headers,
        })

    }

    let stat

    try {
        stat = await Deno.stat(pathname)
    } catch (e) {

        // if `NotFound` or `NotADirectory` like -> 404
        if (
            e instanceof Deno.errors.NotFound ||
            e instanceof Deno.errors.NotADirectory ||
            e instanceof Error && e.message.startsWith(`Not a directory`)
        ) {

            return new Response(void 0, {
                status: Status.NOT_FOUND, headers,
            })

        }

        throw e

    }

    if (stat.isFile != true) {

        return new Response(void 0, {
            status: Status.NOT_FOUND, headers,
        })

    }

    // Note : Support only weak Etag
    const preconds = computePrecondHeaders(stat)

    if (preconds) {

        for (
            const i of [
                HeaderName.ETAG,
                HeaderName.VARY,
                HeaderName.LAST_MODIFIED,
            ] as const
        ) {

            headers.set(i, preconds[i])

        }

    }

    const status = evaluatePreconds(req, preconds)

    if (
        status != Status.OK &&
        status != Status.PARTIAL_CONTENT
    ) {

        // Note : MUST be `null` or `undefined`
        return new Response(void 0, {
            status, headers,
        })

    }

    const contentType = createContentTypeFromPathname(pathname)
    const {
        size,
    } = stat

    // if `HEAD` or empty body -> send headers only & ignore the `Range` header
    if (method == Allowed.HEAD || size <= 0) {

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
            status, headers,
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

        if (preconds) {
            headers.delete(HeaderName.VARY)
            headers.delete(HeaderName.ETAG)
            headers.delete(HeaderName.LAST_MODIFIED)
        }

        return new Response(void 0, {
            status: Status.RANGE_NOT_SATISFIABLE, headers,
        })

    }

    // more than 1 range -> multipart/byteranges
    if (computeds.length > 1) {

        const boundary = createBoundary()

        headers.set(HeaderName.CONTENT_TYPE,
            `multipart/byteranges boundary=${boundary}`
        )

        const file = await Deno.open(pathname)
        const init = {
            status, headers,
        }

        const pipe = createMultipartBytesStream(
            file, size, contentType, computeds, boundary
        )

        // Note : No need to precompute the `Content-Length`
        return new Response(
            file.readable.pipeThrough(pipe),
            init,
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
        status, headers,
    }

    const pipe = createSlicedStream(
        file, start, count
    )

    return new Response(
        file.readable.pipeThrough(pipe),
        init,
    )

}
