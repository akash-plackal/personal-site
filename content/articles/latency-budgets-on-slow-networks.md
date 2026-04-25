---
title: Latency Budgets on Slow Networks
description: Practical notes on setting latency budgets for real users on slow links.
date: 2025-12-09
slug: latency-budgets-on-slow-networks
hero: /assets/articles/latency-map.svg
heroAlt: Abstract network latency map artwork.
---

Bandwidth can hide waste on good Wi-Fi, but latency always tells the truth. On poor links, every extra handshake is visible.

## Start with Request and Byte Budgets

I start each feature with a request budget and a byte budget. If the page cannot paint meaningful content in one early response, the design is not finished yet.

## Use Cost Framing for Tradeoffs

> **Developer:** It is only one more request.
>
> **Kid:** One more request for every user, every time.

That frame keeps tradeoffs grounded. A little visual polish is worth it sometimes, but only when the cost is known and controlled.

## Treat Budgets as Creative Constraints

Latency budgets are not a restriction for creativity. They are a tool that protects the user experience when the network is unreliable.
