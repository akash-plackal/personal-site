---
title: Why This Site Stays HTML-First
description: Notes on keeping a personal site HTML-first for speed and reliability.
date: 2026-02-11
slug: why-this-site-stays-html-first
hero: /assets/articles/signal-grid.svg
heroAlt: Abstract signal style artwork.
---

The fastest page is the one that can explain itself before JavaScript wakes up. That is the entire idea behind this site.

## Keep Meaningful Content in HTML

Every page starts from a strict rule: useful content must be in the first HTML response. If I can read and navigate without waiting for scripts, the baseline experience is already good.

## Run Every Feature Through a Cost Check

> **Developer:** Do we need another layer here?
>
> **Kid:** Only if it helps the page show up faster.

That tiny conversation is how most decisions are made. Fancy additions are allowed, but only after they survive the cost check: bytes, requests, and layout stability on a cold load.

## Optimize for Reliability over Novelty

HTML-first keeps the system honest. It is easier to measure, easier to maintain, and far less likely to break when conditions are imperfect.
