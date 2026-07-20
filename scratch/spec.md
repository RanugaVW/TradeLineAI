<USER_REQUEST>
# Candlestick Pattern Recognition Engine — Logic Specification
### Derived from *Japanese Candlestick Charting Techniques, 2nd Ed.* (Steve Nison)
### For: TradeLine AI — Automated Technical Pattern Engine

---

## 0. How to use this document

This is an implementation spec, not a summary of the book. Every pattern below is written as:
**Definition → Detection Rule (pseudocode-ready) → Signal Strength Modifiers → Confirmation Requirement → Invalidation**

Your existing UI already has the right primitives (Support/Resistance detector, BOS labels, Auto Pattern Engine, pattern cards with BULLISH/BEARISH/NEUTRAL tags). This doc gives you the rule set to plug into that engine, organized A→Z by pattern family so you can implement incrementally.

---

## 1. Core primitives every pattern depends on

Before any pattern logic, define these per-candle measurements. Get these exactly right — every pattern rule below is built from them.

```
body        = |close - open|
bodyTop     = max(open, close)
bodyBottom  = min(open, close)
upperShadow = high - bodyTop
lowerShadow = bodyBottom - low
range       = high - low
isBullishCandle = close > open   // white/green
isBearishCandle = close < open   // black/red
```

### Body-size classification (relative, not absolute)
Candlestick logic is **always relative to recent volatility**, never a fixed dollar/point value (crypto especially — a "long body" on PI/USDT at $0.10 is a different absolute number than at $1.00). Compute against a rolling average:

```
avgBody(n=14) = mean(body[i] for i in last n candles)
avgRange(n=14) = mean(range[i] for i in last n candles)

LONG body   : body >= 1.5 * avgBody
SHORT body  : body <= 0.5 * avgBody
DOJI        : body <= 0.05 * avgRange   (open ≈ close)
SMALL body (spinning-top range): 0.05*avgRange < body < 0.5*avgBody
```

### Doji sub-types (needed by many patterns)
| Type | Rule |
|---|---|
| **Standard doji** | `body <= 0.05 * avgRange`, shadows roughly balanced |
| **Long-legged doji / Rickshaw man** | doji AND `upperShadow >= 2*avgBody` AND `lowerShadow >= 2*avgBody`, open/close near range midpoint |
| **Dragonfly doji** | doji AND `upperShadow <= 0.1*range` AND `lowerShadow >= 0.6*range` (open/high/close cluster at top) |
| **Gravestone doji** | doji AND `lowerShadow <= 0.1*range` AND `upperShadow >= 0.6*range` (open/low/close cluster at bottom) |
| **Northern doji** | any doji appearing during/after an established **uptrend** |
| **Southern doji** | any doji appearing during/after an established **downtrend** |

Note from the book: doji in an uptrend (northern doji) are statistically more significant reversal warnings than doji in a downtrend — weight northern doji higher in your scoring than southern doji.

### Trend-context function (mandatory pre-check)
**No reversal pattern should fire without a defined prior trend.** This is the single most-violated rule in amateur pattern engines and the biggest source of false positives.

```
trendContext(candle_index, lookback=5..10):
    use a short EMA slope, or simple higher-highs/higher-lows (up)
    / lower-highs/lower-lows (down) count over lookback window
    return UP | DOWN | SIDEWAYS
```

Every "reversal" pattern in Sections 3–5 below REQUIRES `trendContext == DOWN` (bullish reversal) or `UP` (bearish reversal) as a precondition. Continuation patterns (Section 6) require the trend to already be in place and unbroken.

### Marubozu / shaven candles (used inside several patterns)
```
Shaven bottom  : lowerShadow <= 0.05 * range   (no lower wick)
Shaven head    : upperShadow <= 0.05 * range   (no upper wick)
Marubozu       : shaven top AND shaven bottom (full-body candle, long body)
```

---

## 2. Single-candle patterns

### 2.1 Hammer (bullish reversal)
- **Definition:** Small real body at the *top* of the range, long lower shadow, little/no upper shadow, appearing after a decline.
- **Detection:**
  ```
  IF trendContext == DOWN
  AND lowerShadow >= 2 * body
  AND upperShadow <= 0.1 * range
  AND bodyBottom is in upper 1/3 of range
  THEN Hammer (bullish)
  ```
- **Strength modifiers:** white body slightly more bullish than black ("power line"); longer lower shadow = stronger; smaller real body = stronger.
- **Confirmation:** NOT strictly required (book treats it as a standalone strong signal), but you should still gate signal_confidence higher if next candle closes above the hammer's close.
- **Invalidation:** none needed pre-trade; risk is defined by hammer's low.

### 2.2 Hanging Man (bearish reversal)
- **Definition:** Identical shape to the hammer (small body top of range, long lower shadow ≥ 2–3× body, tiny/no upper shadow) but appearing after an **extended rally**, ideally at a new high.
- **Detection:**
  ```
  IF trendContext == UP (prefer: extended/mature uptrend, not just 1-2 candles)
  AND lowerShadow >= 2 * body   // book says 2–3x for hanging man specifically
  AND upperShadow <= 0.1 * range
  AND bodyBottom is in upper 1/3 of range
  THEN HangingMan (bearish, UNCONFIRMED)
  ```
- **Confirmation is MANDATORY for hanging man** (unlike hammer): the next candle must open below, and ideally close below, the hanging man's real body. Mark the pattern `NEUTRAL/pending` until confirmed, then flip to `BEARISH confirmed`.
- **Implementation note:** this is a key A-Z rule your engine should encode explicitly — hammer and hanging man are geometrically the same shape; only trend-context + confirmation-requirement differ. Detect the shape once, then branch on trend.

### 2.3 Shooting Star (bearish reversal)
- **Definition:** Small real body near the *low* of the range, long upper shadow, little/no lower shadow, after an uptrend.
- **Detection:**
  ```
  IF trendContext == UP
  AND upperShadow >= 2 * body
  AND lowerShadow <= 0.1 * range
  AND bodyTop is in lower 1/3 of range
  THEN ShootingStar (bearish)
  ```
- Gains extra weight if it gaps up from the prior candle (classic "star" gap) — see Section 3 stars.

### 2.4 Inverted Hammer (bullish reversal, needs confirmation)
- **Definition:** Same shape as shooting star (long upper shadow, small body at bottom, little/no lower shadow) but after a **downtrend**.
- **Detection:**
  ```
  IF trendContext == DOWN
  AND upperShadow >= 2 * body
  AND lowerShadow <= 0.1 * range
  AND bodyTop is in lower 1/3 of range
  THEN InvertedHammer (bullish, UNCONFIRMED)
  ```
- **Confirmation MANDATORY:** next candle must open, and ideally close, above the inverted hammer's close. Until then, tag as `pending` — this matches the "Doji ↓" arrow your screenshot shows; use the same pending/confirmed visual pattern for inverted hammer.

### 2.5 Belt-hold lines
- **Bullish belt-hold:** long white body that opens at/near its low (shaven bottom) and closes well off that open.
  ```
  IF isBullishCandle AND body >= 1.5*avgBody
  AND (open - low) <= 0.05*range   // opens on the low
  THEN BullishBeltHold
  ```
- **Bearish belt-hold:** long black body that opens at/near its high (shaven head) and closes well off that open.
  ```
  IF isBearishCandle AND body >= 1.5*avgBody
  AND (high - open) <= 0.05*range
  THEN BearishBeltHold
  ```
- Significance scales with body length and how extended the prior trend was.

### 2.6 High-wave candle
- Very long upper AND lower shadows with a small real body — signals loss of directional consensus.
  ```
  IF upperShadow >= 2*body AND lowerShadow >= 2*body AND body is SMALL
  THEN HighWave (neutral / volatility warning)
  ```
- If the small body is actually a doji, reclassify as **Long-legged doji** instead (more significant).

---

## 3. Star patterns (3-candle, high-value reversals)

A "star" = a small real body that **gaps away** from the prior long body (gap measured candle-to-candle using real bodies, not shadows, unless noted).

### 3.1 Morning Star (bullish reversal, bottom)
```
Candle 1: long BLACK body, trendContext == DOWN going into it
Candle 2: small body (white or black) that gaps DOWN from candle 1's body (a "star")
Candle 3: WHITE candle that closes well into candle 1's body — book standard: > 50% retracement into candle 1
=> MorningStar (bullish)
```
- If candle 2 is a doji instead of a small body → **Morning Doji Star** (stronger signal — flag with higher confidence score).
- Strength scales with: size of the gap, and how deep candle 3 closes into candle 1's real body (deeper = stronger).

### 3.2 Evening Star (bearish reversal, top)
```
Candle 1: long WHITE body, trendContext == UP going into it
Candle 2: small body that gaps UP from candle 1's body
Candle 3: BLACK candle that closes well into candle 1's body (> 50%)
=> EveningStar (bearish)
```
- Candle 2 as doji → **Evening Doji Star** (stronger).

### 3.3 Tri-Star (extremely rare — flag as high-confidence when it fires)
```
Three consecutive DOJI, middle one gapping away from both neighbors in the direction matching morning/evening star geometry
=> TriStar (bullish or bearish per direction)
```
Because this is genuinely rare, don't over-fit your detector to fire often on it — false positives here hurt user trust more than a miss.

### 3.4 Abandoned Baby (rare, very strong)
```
Same 3-candle skeleton as morning/evening star, BUT:
  candle 2 is a doji AND
  candle 2's entire range (including shadows) gaps clear of candle 1's AND candle 3's ranges (a true island)
=> AbandonedBaby (top or bottom, per direction)
```
This is functionally "Morning/Evening Doji Star + island gap on both sides" — implement as a stricter subtype check on top of your existing star detector rather than a separate pipeline.

---

## 4. Two-candle reversal patterns

### 4.1 Engulfing Pattern (bullish / bearish)
Three mandatory criteria from the book — encode all three, not just "body engulfs body":
```
1. trendContext == DOWN (bullish engulfing) or UP (bearish engulfing) — even a short-term trend counts
2. candle2.bodyTop >= candle1.bodyTop AND candle2.bodyBottom <= candle1.bodyBottom
   (real body engulfs the PRIOR real body — shadows do not need to be engulfed)
3. candle2 color is opposite of candle1 color
   EXCEPTION: if candle1 is a doji, an engulfing candle of large size in the reversal
   direction still counts (doji + large engulfing body = valid engulfing variant)
```
- **Confidence boosters (score, don't gate on these):**
  - candle1 has an unusually small body (spinning top) and candle2 is unusually long
  - pattern follows a fast/extended prior move (overbought/oversold)
  - volume on candle2 is above average
- **Use as S/R:** the high/low of the two-candle engulfing range becomes a support (bullish) or resistance (bearish) level — wire this directly into your existing Support & Resistance Auto-Detector so engulfing patterns auto-generate S/R lines, not just pattern tags.

### 4.2 Dark-Cloud Cover (bearish reversal)
```
IF trendContext == UP
AND candle1 is long WHITE
AND candle2 opens ABOVE candle1.high (gap up open, or at least above candle1.close)
AND candle2 is BLACK
AND candle2.close < (candle1.bodyBottom + candle1.body * 0.5)   // closes >50% into candle1's body
THEN DarkCloudCover (bearish)
```
- Deeper penetration (closer to fully engulfing) = stronger signal; if it fully engulfs, reclassify as bearish Engulfing instead.

### 4.3 Piercing Pattern (bullish reversal — mirror of dark-cloud cover)
```
IF trendContext == DOWN
AND candle1 is long BLACK
AND candle2 opens BELOW candle1.low (gap down open)
AND candle2 is WHITE
AND candle2.close > (candle1.bodyBottom + candle1.body * 0.5)   // closes >50% into candle1's body
THEN PiercingPattern (bullish)
```

### 4.4 Harami / Harami Cross
```
IF candle2.bodyTop <= candle1.bodyTop AND candle2.bodyBottom >= candle1.bodyBottom
AND candle1.body is LONG (relative to avgBody)
AND candle2.body is meaningfully smaller than candle1.body
THEN Harami (color of candle2 usually, not required to be, opposite of candle1)

IF above AND candle2 is a DOJI
THEN HaramiCross (stronger — "petrifying pattern")
```
- Significance is higher after a tall first candle and higher still when candle2 is a doji.
- Unlike engulfing, harami does NOT require a strict prior trend check to be structurally valid, but its *reversal implication* is only meaningful with one — gate signal interpretation (not detection) on `trendContext`.

### 4.5 Tweezers Top / Bottom
```
IF candle1.high ≈ candle2.high (within small tolerance, e.g. 0.1% or 1 tick)
AND trendContext == UP
THEN TweezersTop (minor bearish)

IF candle1.low ≈ candle2.low (within tolerance)
AND trendContext == DOWN
THEN TweezersBottom (minor bullish)
```
- **Confluence rule:** if the same two candles also independently satisfy Harami Cross, Engulfing, or Doji-star criteria, upgrade signal_strength — tweezers is a confirming overlay pattern, not usually a standalone trigger. Implement this as a post-pass that scans your already-detected pattern list for overlapping candle indices with matching highs/lows.

### 4.6 On-Neck / In-Neck / Thrusting Line (bearish continuation trio — subtle, rank by strength)
All three: long BLACK candle in a downtrend, followed by a WHITE candle that closes into the black candle's range but not far enough to reverse it.
```
Base: candle1 BLACK long body, trendContext == DOWN, candle2 WHITE, candle2.open < candle1.low (gap down open)

On-neck line:   candle2.close ≈ candle1.low (within ~0.1*avgRange of the low)         → weakest bearish continuation
In-neck line:   candle2.close slightly ABOVE candle1.low, close still << midpoint     → weak bearish continuation
Thrusting line: candle2.close pushes further, into candle1's body but BELOW midpoint  → moderate bearish continuation
(if candle2.close > midpoint → reclassify as Piercing Pattern → bullish reversal instead)
```
- All three are bearish continuation signals; the trend should resume once price breaks below candle2's low. De-prioritize these in your UI (low visual weight / small badge) since the book flags them as subtle, easily-missed, secondary signals — good candidates for a "minor patterns" collapsed section rather than headline cards.

### 4.7 Counterattack Lines (meeting lines)
```
IF candle1 and candle2 are opposite colors
AND candle2 opens with a significant gap continuing candle1's direction
AND candle2.close ≈ candle1.close (within tight tolerance)
THEN CounterattackLine (reflects stalemate — weakens the prevailing trend, doesn't reverse it outright)
```

### 4.8 Separating Lines (continuation)
```
IF candle1 and candle2 are opposite colors
AND candle2.open ≈ candle1.open (within tight tolerance)
AND candle2 continues in the direction of the PRIOR trend (not candle1's color)
THEN SeparatingLines (continuation signal — prior trend resumes)
```

---

## 5. Three-plus candle reversal / structural patterns

### 5.1 Three White Soldiers (bullish, and its degraded variants)
```
Base: 3 consecutive WHITE candles, each close > prior close, each opening within/near the prior candle's real body, each closing at/near its own high
Context: strongest after a period of stable/low prices or at a low
=> ThreeWhiteSoldiers (bullish)
```
**Degraded variants — detect these as override checks on the base pattern, since they change the label/sentiment despite matching the base shape:**
```
Advance Block: base pattern holds, BUT candle2 and/or candle3 show shrinking bodies
               and/or growing upper shadows vs. candle1
               => relabel ADVANCE BLOCK (weakening bullish — caution, not a buy signal)

Stalled Pattern (Deliberation): candles 1–2 are long white with higher closes,
               candle3 is a small white body, either gapping up (a star) or sitting
               "on the shoulder" of candle2's real body (near its top)
               => relabel STALLED PATTERN (bulls exhausting — caution)
```
This mirrors exactly what your screenshot is already doing (labeling "Three White Soldiers — BULLISH @ price") — the enhancement is to add the Advance Block / Stalled Pattern override logic so the engine doesn't keep calling a weakening rally a clean bullish signal.

### 5.2 Three Black Crows (bearish — mirror of above)
```
3 consecutive BLACK candles, each close < prior close, each closing at/near its own low, opening within/near prior candle's body
Context: most significant after an extended rally or at a high price level
=> ThreeBlackCrows (bearish)
```
- Book explicitly flags this pattern as more useful on longer-term charts (daily/weekly) than intraday — consider weighting confidence by timeframe (down-weight three-black-crows signals on 5m/15m charts vs. 1H/4H/1D).

### 5.3 Upside Gap Two Crows (bearish, very rare)
```
Candle1: long WHITE, trendContext == UP
Candle2: BLACK body that gaps UP, opening and closing above candle1's real body (real body entirely above candle1's close)
Candle3: BLACK body that opens ABOVE candle2's open but closes BELOW candle2's close (engulfs candle2, but candle3's close still stays above candle1's close ideally — near-term bearish, not yet a full breakdown)
=> UpsideGapTwoCrows (bearish, rare — flag with a "rare" badge, don't over-detect)
```

### 5.4 Three Mountains / Three Buddha Top, Three Rivers / Inverted Three Buddha Bottom
These are multi-week/swing structural patterns, not single-candle-cluster patterns — implement as a swing-high/swing-low detector layered on top of your candle engine, not a candle-shape matcher.
```
Three Mountains Top: 3 swing highs at roughly the same price level over an extended period
  IF the middle swing high is the tallest of the three → relabel "Three Buddha Top" (= Western head & shoulders)
Three Rivers Bottom: mirror, 3 swing lows at roughly the same level
  IF the middle swing low is the deepest → relabel "Inverted Three Buddha" (= Western inverse head & shoulders)
```
- Confirmation: requires a decisive close through the "neckline" connecting the two outer swing points.

### 5.5 Tower Top / Tower Bottom
```
Tower Top:    one or more tall WHITE candles → lateral/congestion candles → one or more tall BLACK candles
Tower Bottom: one or more tall BLACK candles → lateral/congestion candles → one or more tall WHITE candles
```
Implement as: detect a long-body candle, then N candles of small/mixed bodies (congestion), then a long-body candle of opposite overall direction covering similar magnitude to the first.

### 5.6 Dumpling Top / Frypan Bottom
```
Dumpling Top:  a rounding-over sequence of progressively smaller bodies at a high, CONFIRMED only by a
               downside window (gap) breaking below the rounding formation
Frypan Bottom: mirror — rounding sequence at a low, CONFIRMED only by an upside window breaking above it
```
Both are **not valid signals until the confirming window appears** — keep these as "forming" (gray/pending) until the gap confirms, matching your app's existing pending-vs-confirmed visual language (like the Doji ↓ arrow).

---

## 6. Continuation patterns

### 6.1 Windows (gaps) — foundational, wire into BOS/S-R logic
```
Rising window: candle2.low > candle1.high   (gap up, bullish continuation)
Falling window: candle2.high < candle1.low  (gap down, bearish continuation)
```
- **Core rule from the book (their strongest practical takeaway):** the window itself becomes support (rising window) or resistance (falling window) *based on closing price, not intraday wick*. A close back through the window voids the continuation signal.
- **Recommended integration:** every detected window should auto-register a support/resistance zone in your S&R Auto-Detector, bounded by `[candle1.high, candle2.low]` for rising windows (or the inverse for falling), with an invalidation rule of "close beyond the far edge of the window."

### 6.2 Tasuki Gaps (upward/downward gapping tasuki)
```
Upward gapping tasuki: rising window, then WHITE candle, then BLACK candle that opens inside
   the white candle's body and closes below the white body (but the window itself stays open)
Downward gapping tasuki: falling window, BLACK candle, then WHITE candle closing above the black body
```
- Per the book's own updated guidance (2nd edition): **the window matters far more than the exact tasuki candle colors.** Practical recommendation — implement window detection as the primary continuation signal, and treat tasuki as an optional secondary tag rather than a pattern you spend detection budget hunting for. Rule to encode: "Rising window = bullish continuation + support at window; close under window voids it" regardless of which candles follow.

### 6.3 Gapping Plays (high-price / low-price)
```
High-price gapping play: after a strong up move, several small real bodies consolidate near the highs,
   then a rising window breaks out of that consolidation → bullish continuation
   Invalidated by a close back under the rising window.
Low-price gapping play: mirror at lows with a falling window → bearish continuation
```

### 6.4 Side-by-Side White Lines
```
Two consecutive WHITE candles, same open price (approx), similar body size
IF preceded by a rising window in an uptrend → bullish continuation
IF preceded by a falling window in a downtrend → STILL bearish continuation (white color doesn't override the gap context)
```

### 6.5 Rising / Falling Three Methods
```
Rising Three Methods (bullish continuation):
  candle1: long WHITE
  candles 2-4: small bodies (any color, typically) that stay WITHIN candle1's high-low range
  candle5: long WHITE that closes at a new high vs. candle1
  => bullish continuation, uptrend resumes

Falling Three Methods (bearish continuation): mirror, long BLACK ... 3 small bodies inside range ... long BLACK new low
```

### 6.6 Separating Lines
Already covered in 4.8 (two-candle continuation family) — cross-reference, don't duplicate detection logic.

---

## 7. Confirmation & signal-scoring framework

The book's central caution — and the single most important system-design implication — is: **candlestick patterns describe sentiment shift, not a guaranteed trade trigger.** Build this into your scoring, not just your detection:

### 7.1 Confidence score components (suggested weights — tune empirically)
```
base_score = pattern_type_base_weight        // e.g. Engulfing=70, Doji=30, Hammer=55, Morning Star=75
+ trend_context_strength (0-15)               // how clean/extended was the prior trend
+ penetration_depth (0-15)                     // for dark cloud/piercing/harami — how far into prior body
+ volume_confirmation (0-15)                   // above-average volume on the signal candle(s)
+ confluence_bonus (0-20)                      // overlapping S/R level, trend line, retracement level, or moving average at the same price
+ confirmation_candle_bonus (0-15)             // only for patterns requiring confirmation (hanging man, inverted hammer, shooting star) — add once next candle confirms
- rarity_penalty                               // for very rare patterns (abandoned baby, upside gap two crows, tri-star) subtract a caution factor unless every criterion is unambiguous, to avoid false-positive spam
```
- Never fire a "confirmed" bullish/bearish tag for patterns the book explicitly marks as needing confirmation (hanging man, inverted hammer, shooting star used alone) until the confirming candle closes. Use a 3-state status: `forming → pending confirmation → confirmed / invalidated`.

### 7.2 Volume overlay (book Chapter 15 principle)
```
IF pattern candle(s) volume > 1.5 * avg_volume(20)
   THEN boost confidence
IF a doji or spinning top forms on high volume during a decline
   THEN treat as stronger reversal evidence than the same shape on normal volume
   (heavy supply being absorbed by equally heavy demand)
```

### 7.3 Convergence checklist (book Part 2 — "Power of Convergence")
Before surfacing a pattern as a high-confidence signal, check whether it aligns with:
- [ ] a trend line (pattern at a trend line = "spring"/"upthrust" setup)
- [ ] a horizontal support/resistance level (your existing Key S/R detector)
- [ ] a Fibonacci retracement level
- [ ] a moving average (the book uses simple/weighted/exponential MAs as dynamic S/R)
- [ ] an oscillator extreme (RSI overbought/oversold, Stochastics, MACD divergence)
- [ ] prior window/gap support-resistance (Section 6.1)

Each checked box = a `confluence_bonus` increment. This is exactly the kind of "3+ Bounce Rule" logic your engine banner already references — extend that same confluence-counting approach from S/R bounces to pattern-plus-S/R alignment.

---

## 8. Suggested engine architecture (A → Z build order)

```
A. Candle primitive layer       → body/shadow/range calculators, rolling avgBody/avgRange (Section 1)
B. Trend-context module         → swing high/low or EMA-slope based UP/DOWN/SIDEWAYS tagger (Section 1)
C. Single-candle classifier     → doji subtypes, hammer/hanging-man/shooting-star/inverted-hammer, belt-hold, marubozu (Section 2)
D. Two-candle pattern scanner   → engulfing, dark-cloud/piercing, harami/harami-cross, tweezers, neck-line trio, counterattack, separating (Section 4)
E. Three-candle pattern scanner → morning/evening star (+doji variants), three soldiers/crows (+ advance block/stalled overrides), abandoned baby, tri-star, upside-gap-two-crows (Sections 3 & 5)
F. Structural/swing scanner     → three mountains/rivers, tower top/bottom, dumpling/frypan (Section 5.4-5.6) — runs on swing-point data, not raw candles
G. Gap/window engine            → rising/falling windows, tasuki, gapping plays, side-by-side lines, three methods (Section 6) — feeds directly into your S/R auto-detector
H. Confirmation state machine   → forming/pending/confirmed/invalidated status per pattern instance (Section 7.1)
I. Scoring & confluence layer   → combine pattern + volume + S/R + trendline + oscillator overlaps into one confidence number surfaced in the UI (Section 7)
J. Alerting/labeling layer      → your existing BOS + pattern-card UI consumes I's output; only surface patterns above a confidence floor to avoid alert fatigue
```

### Suggested output schema per detected pattern instance
```json
{
  "pattern": "MorningStar",
  "variant": "doji_star",
  "direction": "bullish",
  "status": "confirmed",
  "candles": [idx1, idx2, idx3],
  "price_level": 0.0985,
  "confidence": 78,
  "confluence": ["support_zone_3touch", "rsi_oversold"],
  "invalidation_price": 0.0940
}
```

---

## 9. Key caveats to encode as guardrails, not just documentation

1. **No pattern is valid without trend context.** A "hammer" in a sideways market is just a candle with a long lower wick — don't tag it.
2. **Confirmation-required patterns must not be labeled as firm signals pre-confirmation.** Hanging Man, Inverted Hammer, Shooting Star (standalone) — show as pending until the next candle confirms.
3. **Body-size and doji thresholds must be relative to recent volatility (rolling avgBody/avgRange), never fixed price/point thresholds** — critical for an app that trades everything from PI/USDT at $0.10 to BTC at six figures.
4. **Rare patterns (Abandoned Baby, Tri-Star, Upside Gap Two Crows) should be rate-limited/flagged distinctly** — if your engine fires these often, the detection thresholds are almost certainly too loose.
5. **Longer timeframes carry more weight** for the multi-candle reversal patterns (three soldiers/crows especially) — the book explicitly notes these matter more on daily/weekly charts than short intraday bars; consider a timeframe multiplier in your confidence score.
6. **Patterns are sentiment signals, not standalone trade triggers** — the book repeatedly stresses combining candle signals with risk/reward analysis and other confirming technicals (Part 2 of the book, Section 7.3 above) rather than auto-trading off a single pattern tag.

---

*Source: Steve Nison, "Japanese Candlestick Charting Techniques," 2nd Edition (New York Institute of Finance). This document translates the book's descriptive pattern definitions into implementable detection rules; exact numeric thresholds (e.g., the 1.5×/2×/0.5× multipliers) are engineering interpretations of the book's qualitative rules ("long lower shadow," "small real body," etc.) and should be tuned against your own backtest data.* enhance our system and implement and show them relevently to the user?
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-07-20T21:56:57+05:30.

The user's current state is as follows:
Active Document: c:\Users\ranug\Crypto\src\components\ControlsBar.js (LANGUAGE_JAVASCRIPT)
Cursor is on line: 235
Other open documents:
- c:\Users\ranug\Crypto\src\components\ControlsBar.js (LANGUAGE_JAVASCRIPT)
- c:\Users\ranug\Crypto\src\components\AnalyticsPanel.js (LANGUAGE_JAVASCRIPT)
- c:\Users\ranug\Crypto\src\api\geminiApi.js (LANGUAGE_JAVASCRIPT)
- c:\Users\ranug\Crypto\package.json (LANGUAGE_JSON)
- c:\Users\ranug\Crypto\src\main.js (LANGUAGE_JAVASCRIPT)
</ADDITIONAL_METADATA>