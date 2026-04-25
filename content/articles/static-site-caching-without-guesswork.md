---
title: Static Site Caching Without Guesswork
description: A practical approach to immutable asset caching and predictable HTML freshness.
date: 2026-02-16
slug: static-site-caching-without-guesswork
hero: /assets/articles/static-cache-hero.svg
heroAlt: Static cache layers and refresh flow diagram.
---

Caching looks simple until a deploy goes live and half your users run old bytes while the other half hit the new build. Predictable caching is less about clever directives and more about strict separation.

## Separate HTML from Assets

I split the world into two buckets. Bucket one is HTML: short-lived, revalidated often, allowed to change frequently. Bucket two is assets: immutable, fingerprinted, and aggressively cached. Mixing those two policies is where confusion begins.

On static hosting this separation is easier than on many dynamic stacks, but only if you make it explicit. If your HTML references stable asset URLs that get overwritten in place, long cache lifetimes become a trap. If your assets are fingerprinted, long cache lifetimes become a feature.

## Verify Wire Headers After Deploy

The payoff is immediate on repeat visits. Browser cache can satisfy most asset fetches without network round trips, leaving only the document to negotiate freshness. That shrinks latency variance and makes navigation feel consistent.

> **Developer:** Should we just set everything to one year?
>
> **Kid:** Only if everything is immutable. Most things are not.

I also avoid cargo-cult directives. A header is useful only when the file lifecycle matches it. `immutable` on a mutable path is effectively a bug report scheduled for later.

Another practical habit is checking response headers after deployment, not just in local config. CDNs and platform defaults can merge or override directives, and the final wire response is the only source that matters.

## Match Directives to File Lifecycle

For HTML, I prefer short cache with `stale-while-revalidate`. Users get fast responses while the edge refreshes quietly. For assets, I prefer long `max-age` and `immutable` because the filename itself encodes version.

The biggest mistake I see is attaching correctness to hope. If your invalidation model depends on every layer behaving perfectly every time, you do not have a model yet. You have luck.

## Reduce Cache-State Complexity

Good caching should reduce decision count. You should know exactly which class a file belongs to before it ships. If the answer is ambiguous, simplify the delivery path until it is not.

On this site, predictable caching keeps first visits honest and repeat visits fast. The browser does less work, the network does fewer trips, and I spend less time investigating random stale states.

## Treat Reliability as Performance

Reliability is a performance feature. The fastest page is the one that behaves the same way tomorrow as it did today.
