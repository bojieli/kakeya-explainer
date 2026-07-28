# Kakeya, made visible

A standalone interactive webpage explaining Kakeya sets through the finite-scale δ-tubes used in the three-dimensional theory. One continuous visual story packs thick unit segments, covers that same packing with cubes, and explains why zero volume can coexist with full three-dimensional scaling.

## Open it

Double-click `index.html`, or serve the folder locally:

```sh
cd /Users/boj/kakeya-explainer
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

The page has no third-party runtime dependencies and works offline.

## 2026 news context

The hero’s Fields Medal teaser is sourced from the International Mathematical Union’s official 2026 citation for Hong Wang, which names her major advances on the Kakeya problem in three dimensions; BBC News’ report identifying Wang and Yu Deng as China’s first Fields Medal recipients; and Quanta Magazine’s July 23, 2026 profile. The latter reports that Wang and Joshua Zahl’s proof of the three-dimensional Kakeya conjecture was checked and accepted by the community and describes it as a “once in a century” proof.

## Accuracy note

The first animation draws a finite sample of 100 unit segments with visible δ-scale thickness. Packing changes only the centers of the tubes; their direction vectors and lengths remain fixed. This demonstrates the union-volume mechanism but is explicitly not presented as the Wang–Zahl construction.

The cube-counting view uses the same packed placement rule. Its ten ruler settings run from `δ = 1/2` through `δ = 1/20` in even denominator steps. At ruler `1/m`, the page draws `m²` nested direction samples—from 4 through 400—reflecting the fact that directions in three-dimensional space require on the order of `δ⁻²` samples at scale δ. A cube is retained only when a segment-to-cube distance test says it intersects one of the displayed thick tubes. Only surface cubes are rendered, because interior cubes are visually occluded, but the counter includes the full cover.

The separate rate model is deliberately labeled as arithmetic rather than as a Kakeya construction. At decimal ruler size `10⁻ⁿ`, it sets `Nₙ = floor(10³ⁿ/n)`. Its occupied fraction is asymptotic to `1/n` and tends to zero, while its effective exponent approaches `3 − log₁₀(n)/n` and therefore tends to 3. Integer rounding does not affect the limit. This makes the zero-volume/full-dimension distinction concrete without claiming that the displayed finite bundle proves the Kakeya theorem.
