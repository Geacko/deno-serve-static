# Descripion

HTTP endpoint to serve static files on Deno Platform

## Basic Usage

```ts
import { serveStatic } from "jsr:@geacko/deno-serve-static";
import { lookup } from "jsr:@geacko/mimes";

Deno.serve(serveStatic({
  generateFilename(req){ 
    return "assets" + new URL(req.url).pathname 
  },
  generateContentType({pathname}){ 
    return lookup(pathname)?.contentType ?? ``
  }
}));
```

## Features

- Allow methods
  - `HEAD`
  - `OPTIONS`
  - `GET`
- Range requests (`Range` and `Content-Range` headers)
- Multipart range requests (`multipart/byteranges`)
- Support for weak entity tags (`ETag`)
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
