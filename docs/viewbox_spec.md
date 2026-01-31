**# aFLR Viewbox Visual Spec (1280×720)**



**## Ground-truth references**

**- `docs/reference/figure-2.4\_layer4\_layout.png` (Layer 4 element bounds)**

**- `docs/reference/figure-2.5\_full\_mockup.png` (Full stacked mockup)**



**## Coordinate system**

**- Viewbox is exactly \*\*1280×720\*\***

**- All positions are \*\*(x,y)\*\* from \*\*top-left\*\* of the viewbox**

**- Sizes are \*\*(w×h)\*\* in pixels**

**- Use absolute positioning inside a `position: relative` stage**



**## Layering (bottom → top)**

**1. Layer2: Background video (full frame)**

**2. Layer3: Optional overlays / transitional media**

**3. Layer4: Broadcast UI containers (boxes below)**

**4. Layer5: Fullscreen video + emergency alert overlays**



**## Layer 4 elements (from Figure 2.4)**

**| Element | x | y | w | h |**

**|---|---:|---:|---:|---:|**

**| Newscast Title | 10 | 10 | 694 | 80 |**

**| Main Content | 24 | 106 | 662 | 372 |**

**| Live Feed/Stream | 716 | 36 | 546 | 524 |**

**| Story Headline | 10 | 492 | 696 | 68 |**

**| Icon/Logo | 6 | 566 | 96 | 96 |**

**| Story Subtext | 110 | 566 | 964 | 96 |**

**| Weather | 1078 | 566 | 202 | 98 |**

**| Time/Clock | 1104 | 664 | 176 | 56 |**

**| Marquee/Ticker | 0 | 670 | 1104 | 50 |**



**## Visual behavior rules**

**- All Layer4 elements render even if content missing (show placeholders in dev/debug)**

**- Text should not overflow boxes: clamp/ellipsis (headline up to 2 lines, subtext up to 2 lines)**

**- Marquee scrolls left continuously; items separated by •**

**- Clock displays local time HH:MM AM/PM**

**- Weather displays temp + icon placeholder**



**## Dev/Debug Guides**

**- Provide a `?guides=1` mode that draws semi-transparent outlines around each element using the bounds above.**



