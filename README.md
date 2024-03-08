# Descripion

HTTP endpoint to serve static files on Deno Platform

## Basic Usage

```ts
import { serveStatic } from "jsr@geacko/deno-serve-static";

Deno.serve(serveStatic({
  rewrite: (pathname) => "/assets" + pathname,
}));
```

## Features

- Allow methods
  - `HEAD`
  - `OPTIONS`
  - `GET`
- Range requests (`Range` and `Content-Range` headers)
- Multipart range requests (`multipart/byteranges`)
- Support for weak entity tags (`ETag` prefixed with `W/`)
- Conditional requests
  - `If-Match`
  - `If-None-Match`
  - `If-Modified-Since`
  - `If-Unmodified-Since`
  - `If-Range`

## What doesn't `deno-serve-static` do ?

- No `Cache-Control`
- No support for `Cors` request
- No support for `Authorization`
- No Directory Indexing

We let you handle these cases...

## More Complexe example

```ts
import { create } from "jsr:@geacko/pipe";
import { serveStatic } from "jsr:@geacko/deno-serve-static";

const useCacheControl = async (
  req: Request,
  next: (req: Request) => Response | Promise<Response>,
) => {
  const out = await next(req);
  if (out.status == 200) {
    out.headers.set(`Cache-Control`, `public, max-age=${60 * 60 * 24}`);
  }
  return out;
};

Deno.serve(create(
  serveStatic({
    rewrite: (pathname) => "/assets" + pathname,
  }),
  useCacheControl,
));
```
