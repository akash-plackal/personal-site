---
title: Request Waterfalls I Actually Trust
description: How I read network waterfalls under slow conditions without fooling myself.
date: 2026-02-22
slug: request-waterfalls-i-actually-trust
hero: /assets/articles/request-waterfalls-hero.svg
heroAlt: Request waterfall timing bars and network lanes.
---

A waterfall is only useful when it matches what a user feels. The pretty screenshot is not the result. The repeatable bottleneck is.

## Start with a Cold Baseline

I start with a blank profile, disabled cache, and Slow 4G throttling. If a page feels fast only on my warm desktop tab, I treat the result as invalid. The first visit is where architecture gets exposed.

Then I check whether the browser had enough meaningful HTML before it had enough JavaScript. If the answer is yes, your baseline is safe. If the answer is no, your app is still negotiating with the network before it can explain itself.

## Follow the First Blocking Chain

The first thing I scan is not total page weight. I look at the first blocking chain from HTML to first paint: DNS, TLS, document TTFB, critical bytes in the HTML, then any required render work. This path is where user trust is built.

> **Developer:** But the total load time is still low.
>
> **Kid:** Low for who, and on what connection?

## Watch for Hidden Queueing

I also watch for hidden queueing. One deferred script can still sit in the critical network window and move milestones like `DOMContentLoaded` or `load`. Even if paint is fine, that shift can mislead measurements and trigger unnecessary regressions in dashboards.

On static sites, the most common mistake is scattering tiny assets. Each file looks cheap in isolation, but the handshake and prioritization costs stack up. I would rather send one richer HTML document than force the browser to coordinate five tiny requests.

## Compare Traces Side by Side

I annotate waterfalls in plain language: "first paint depends on X," "hero image starts too late," "third-party frame waits on main thread." Numbers matter, but naming the dependency chain prevents the same bug from reappearing in a new form later.

Another habit: I compare two traces side by side and ask only one question, "what moved earlier or later?" That keeps analysis honest. When many variables change at once, every optimization story sounds plausible, and most of them are wrong.

## Optimize for Explainability

For this site, a good waterfall has three properties. The HTML arrives quickly, the first paint happens without waiting for app logic, and any enhancement script can fail without breaking reading or navigation.

If I cannot explain a trace in one sentence, I keep reducing. Faster systems are usually simpler systems with fewer opportunities for the browser to hesitate.

Waterfalls are not there to impress. They are there to reveal whether your assumptions survive contact with latency.
