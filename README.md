# Kakeya, made visible

A standalone interactive webpage explaining Kakeya sets through the finite-scale δ-tubes used in the three-dimensional theory. One continuous visual story packs thick unit segments, covers that same packing with cubes, and explains why zero volume can coexist with full three-dimensional scaling.

**Live site:** https://bojieli.github.io/kakeya-explainer/

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

The cube-counting view uses the same packed placement rule. Its ten interactive ruler settings run from `δ = 1/2` through `δ = 1/20` in even denominator steps. At ruler `1/m`, the page draws `m²` nested direction samples—from 4 through 400—reflecting the fact that directions in three-dimensional space require on the order of `δ⁻²` samples at scale δ. All ten numerical counts are embedded exact results computed offline, so the browser never recomputes the full curve. For the one ruler currently selected, JavaScript builds only the 3D surface needed by the animation. A surface cube is retained only when a segment-to-cube distance test says it intersects a displayed thick tube. Interior cubes are visually occluded, but the embedded counter includes the full cover.

The curve adds exact offline counts at `δ = 1/25`, `1/30`, every tenth from `1/40` through `1/100`, and the longer-range checkpoints `1/200`, `1/500`, and `1/1000`. They were computed by `scripts/precompute_counts.cpp`. The final count is 456,958,817 occupied cubes out of 3,375,000,000 available frame cubes. The plotted finite slope is

`d₂→m = log(Nₘ/25) / log(m/2)`.

This quantity rises from the actual measured counts; it is not labeled as the dimension of the finite diagram. The Wang–Zahl theorem supplies the limiting dimension-3 conclusion for every genuine Kakeya set. No `1/10000` estimate is plotted as if it were a measurement: that frame contains 3.375 trillion possible cubes and would require roughly 422 GB just for a one-bit occupancy map with this exact algorithm.

To reproduce an offline count on a C++17 compiler:

```sh
c++ -O3 -std=c++17 -pthread scripts/precompute_counts.cpp -o precompute_counts
./precompute_counts 2 4 6 8 10 12 14 16 18 20 25 30 40 50 60 70 80 90 100 200 500 1000
```
