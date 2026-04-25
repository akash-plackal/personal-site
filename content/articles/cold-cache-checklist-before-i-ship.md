---
title: Cold-Cache Checklist Before I Ship
description: A practical pre-ship checklist for first-visit performance on slow networks.
date: 2026-02-20
slug: cold-cache-checklist-before-i-ship
hero: /assets/articles/cold-cache-checklist-hero.svg
heroAlt: Checklist cards and timing icon for cold-cache validation.
---

I stopped asking "is it fast on my machine" and started asking "does it still feel immediate on first visit, with nothing cached, on a weak connection?" That changed almost every decision.

## Lock the Baseline

Before shipping any page, I run a cold-cache checklist. It is not elegant, but it keeps me from shipping a layout that looks clean in a demo and drags in production.

First check: meaningful HTML in the initial response. If the first document cannot stand on its own, I treat the design as unfinished. Content that appears only after script execution is not dependable content.

## Protect the Early Network Window

Second check: request count at startup. I count what the browser must fetch before a user can orient themselves. One more "tiny" request is still one more handshake, one more queue slot, and one more chance to miss an early paint window.

Third check: CSS that can explain the screen immediately. I keep critical rules in the document and avoid making layout dependent on late stylesheets. Stability beats convenience every time.

> **Developer:** But the optimization is only 4 KB.
>
> **Kid:** 4 KB plus one request plus one parse plus one more thing to fail.

## Enforce Enhancement Discipline

Fourth check: no JavaScript dependency for reading. I allow JavaScript for enhancement, motion polish, or optional behavior. I do not allow it to gate navigation or core text. If script download stalls, the page should still be usable.

Fifth check: image discipline. Every image gets explicit dimensions, sensible format, and a clear priority. If an image is not needed for the first decision on the page, it should not compete with the first decision on the network.

## Measure Navigation and Caching

Sixth check: trace comparison. I record one baseline run, change one thing, and re-run. If I cannot point to a concrete trace improvement, I assume the change is noise and roll it back.

Seventh check: interaction after navigation. Back and forward flows should feel instant when the browser can restore from memory. I verify BFCache behavior because users navigate in loops, not in perfect single-page journeys.

Eighth check: real wording in the UI. Dense, useful copy improves perceived speed because users can act immediately. Empty hero sections, delayed text, and decorative placeholders make fast systems feel slow.

Ninth check: cache headers that match intent. Immutable assets need long cache lifetimes, while HTML needs controlled freshness. If these rules are blurry, performance drifts over time and every deployment behaves a little differently.

## Ship by Removing One Thing

Tenth check: remove one thing before shipping. It can be a request, a decorative effect, or a redundant wrapper. Performance usually improves most when we delete confidently rather than optimize endlessly.

The checklist is boring by design. Boring systems are predictable, and predictable systems are fast for real people on bad days.
