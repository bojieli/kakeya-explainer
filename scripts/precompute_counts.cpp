#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <thread>
#include <vector>

namespace {

constexpr double kPi = 3.14159265358979323846;
constexpr double kTau = 2.0 * kPi;
constexpr double kFrameMin = -0.75;

struct Point {
  double x;
  double y;
  double z;
};

double radicalInverse(std::uint64_t value, std::uint64_t base) {
  double result = 0.0;
  double fraction = 1.0 / static_cast<double>(base);
  while (value > 0) {
    result += static_cast<double>(value % base) * fraction;
    value /= base;
    fraction /= static_cast<double>(base);
  }
  return result;
}

Point directionFor(std::uint64_t index) {
  const std::uint64_t i = index + 1;
  const double y = 0.025 + radicalInverse(i, 2) * 0.95;
  const double phi = kTau * radicalInverse(i, 3);
  const double radial = std::sqrt(std::max(0.0, 1.0 - y * y));
  return {radial * std::cos(phi), y, radial * std::sin(phi)};
}

Point packedCenter(std::uint64_t index, const Point& direction) {
  const double phi = std::atan2(direction.z, direction.x);
  const int branch = static_cast<int>(std::floor(((phi + kPi) / kTau) * 6.0)) % 6;
  const double branchAngle = static_cast<double>(branch) * kTau / 6.0;
  const double tremor = std::sin(static_cast<double>(index) * 2.41) * 0.025;
  return {
      0.11 * std::cos(branchAngle) + tremor * direction.y,
      0.07 * (direction.y - 0.5) + std::cos(static_cast<double>(index) * 1.73) * 0.018,
      0.11 * std::sin(branchAngle) + tremor * direction.x,
  };
}

double pointBoxDistanceSquared(const Point& point, const Point& low, const Point& high) {
  double result = 0.0;
  const std::array<double, 3> p{point.x, point.y, point.z};
  const std::array<double, 3> lo{low.x, low.y, low.z};
  const std::array<double, 3> hi{high.x, high.y, high.z};
  for (int axis = 0; axis < 3; ++axis) {
    if (p[axis] < lo[axis]) result += (lo[axis] - p[axis]) * (lo[axis] - p[axis]);
    if (p[axis] > hi[axis]) result += (p[axis] - hi[axis]) * (p[axis] - hi[axis]);
  }
  return result;
}

double segmentBoxDistanceSquared(const Point& start, const Point& end,
                                 const Point& low, const Point& high) {
  const std::array<double, 3> a{start.x, start.y, start.z};
  const std::array<double, 3> d{end.x - start.x, end.y - start.y, end.z - start.z};
  const std::array<double, 3> lo{low.x, low.y, low.z};
  const std::array<double, 3> hi{high.x, high.y, high.z};
  const auto evaluate = [&](double t) {
    return pointBoxDistanceSquared({
        a[0] + d[0] * t,
        a[1] + d[1] * t,
        a[2] + d[2] * t,
    }, low, high);
  };

  // Break [0,1] where a coordinate enters or leaves the box. On each resulting
  // interval the squared distance is one quadratic, so its minimum is explicit.
  std::array<double, 8> breaks{};
  int breakCount = 0;
  breaks[breakCount++] = 0.0;
  breaks[breakCount++] = 1.0;
  for (int axis = 0; axis < 3; ++axis) {
    if (d[axis] == 0.0) continue;
    const double first = (lo[axis] - a[axis]) / d[axis];
    const double second = (hi[axis] - a[axis]) / d[axis];
    if (first > 0.0 && first < 1.0) breaks[breakCount++] = first;
    if (second > 0.0 && second < 1.0) breaks[breakCount++] = second;
  }
  std::sort(breaks.begin(), breaks.begin() + breakCount);
  double best = std::min(evaluate(0.0), evaluate(1.0));
  for (int interval = 0; interval + 1 < breakCount; ++interval) {
    const double left = breaks[interval];
    const double right = breaks[interval + 1];
    if (right - left < 1e-15) continue;
    const double middle = (left + right) * 0.5;
    double numerator = 0.0;
    double denominator = 0.0;
    for (int axis = 0; axis < 3; ++axis) {
      const double position = a[axis] + d[axis] * middle;
      double boundary = position;
      if (position < lo[axis]) boundary = lo[axis];
      else if (position > hi[axis]) boundary = hi[axis];
      else continue;
      numerator += d[axis] * (a[axis] - boundary);
      denominator += d[axis] * d[axis];
    }
    const double optimum = denominator > 0.0 ? -numerator / denominator : middle;
    best = std::min(best, evaluate(std::clamp(optimum, left, right)));
  }
  return best;
}

std::uint64_t cellId(int x, int y, int z, int n) {
  return (static_cast<std::uint64_t>(x) * n + y) * n + z;
}

std::uint64_t countCover(int denominator) {
  const int n = static_cast<int>(std::lround(1.5 * denominator));
  const double delta = 1.0 / denominator;
  const double radius = 0.46 * delta;
  const std::uint64_t tubeCount = static_cast<std::uint64_t>(denominator) * denominator;
  const std::uint64_t available = static_cast<std::uint64_t>(n) * n * n;
  std::vector<std::uint64_t> occupied((available + 63) / 64, 0);
  std::uint64_t occupiedCount = 0;

  const auto processRange = [&](std::uint64_t firstTube, std::uint64_t lastTube) {
    std::vector<std::uint64_t> candidates;
    candidates.reserve(static_cast<std::size_t>(denominator) * 48);
    std::uint64_t localCount = 0;
    const auto addCandidateNeighborhood = [&](int cx, int cy, int cz) {
      for (int dx = -1; dx <= 1; ++dx) {
        for (int dy = -1; dy <= 1; ++dy) {
          for (int dz = -1; dz <= 1; ++dz) {
            const int x = cx + dx;
            const int y = cy + dy;
            const int z = cz + dz;
            if (x >= 0 && x < n && y >= 0 && y < n && z >= 0 && z < n) {
              candidates.push_back(cellId(x, y, z, n));
            }
          }
        }
      }
    };

    for (std::uint64_t index = firstTube; index < lastTube; ++index) {
    const Point direction = directionFor(index);
    const Point center = packedCenter(index, direction);
    const Point start{center.x - direction.x * 0.5,
                      center.y - direction.y * 0.5,
                      center.z - direction.z * 0.5};
    const Point end{center.x + direction.x * 0.5,
                    center.y + direction.y * 0.5,
                    center.z + direction.z * 0.5};

    candidates.clear();
    int cell[3] = {
        std::clamp(static_cast<int>(std::floor((start.x - kFrameMin) / delta)), 0, n - 1),
        std::clamp(static_cast<int>(std::floor((start.y - kFrameMin) / delta)), 0, n - 1),
        std::clamp(static_cast<int>(std::floor((start.z - kFrameMin) / delta)), 0, n - 1),
    };
    const std::array<double, 3> a{start.x, start.y, start.z};
    const std::array<double, 3> b{end.x, end.y, end.z};
    std::array<int, 3> step{};
    std::array<double, 3> tMax{};
    std::array<double, 3> tDelta{};
    for (int axis = 0; axis < 3; ++axis) {
      const double change = b[axis] - a[axis];
      if (change > 0) {
        step[axis] = 1;
        const double boundary = kFrameMin + (cell[axis] + 1) * delta;
        tMax[axis] = (boundary - a[axis]) / change;
        tDelta[axis] = delta / change;
      } else if (change < 0) {
        step[axis] = -1;
        const double boundary = kFrameMin + cell[axis] * delta;
        tMax[axis] = (boundary - a[axis]) / change;
        tDelta[axis] = -delta / change;
      } else {
        step[axis] = 0;
        tMax[axis] = INFINITY;
        tDelta[axis] = INFINITY;
      }
    }

    addCandidateNeighborhood(cell[0], cell[1], cell[2]);
    while (true) {
      int axis = 0;
      if (tMax[1] < tMax[axis]) axis = 1;
      if (tMax[2] < tMax[axis]) axis = 2;
      if (tMax[axis] > 1.0) break;
      cell[axis] += step[axis];
      tMax[axis] += tDelta[axis];
      if (cell[axis] < 0 || cell[axis] >= n) break;
      addCandidateNeighborhood(cell[0], cell[1], cell[2]);
    }

    std::sort(candidates.begin(), candidates.end());
    candidates.erase(std::unique(candidates.begin(), candidates.end()), candidates.end());
    for (const std::uint64_t id : candidates) {
      const std::uint64_t word = id >> 6;
      const std::uint64_t mask = UINT64_C(1) << (id & 63);
      if ((__atomic_load_n(&occupied[word], __ATOMIC_RELAXED) & mask) != 0) continue;
      const int z = static_cast<int>(id % n);
      const std::uint64_t xy = id / n;
      const int y = static_cast<int>(xy % n);
      const int x = static_cast<int>(xy / n);
      const Point low{kFrameMin + x * delta, kFrameMin + y * delta, kFrameMin + z * delta};
      const Point high{low.x + delta, low.y + delta, low.z + delta};
      if (segmentBoxDistanceSquared(start, end, low, high) <= radius * radius + 1e-12 * delta * delta) {
        const std::uint64_t previous = __atomic_fetch_or(&occupied[word], mask, __ATOMIC_RELAXED);
        if ((previous & mask) == 0) ++localCount;
      }
    }
    }
    __atomic_fetch_add(&occupiedCount, localCount, __ATOMIC_RELAXED);
  };

  const unsigned int hardwareThreads = std::max(1u, std::thread::hardware_concurrency());
  const unsigned int threadCount = denominator >= 100 ? std::min(8u, hardwareThreads) : 1u;
  std::vector<std::thread> workers;
  for (unsigned int thread = 0; thread < threadCount; ++thread) {
    const std::uint64_t first = tubeCount * thread / threadCount;
    const std::uint64_t last = tubeCount * (thread + 1) / threadCount;
    workers.emplace_back(processRange, first, last);
  }
  for (auto& worker : workers) worker.join();
  return occupiedCount;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: precompute_counts DENOMINATOR [DENOMINATOR ...]\n";
    return 1;
  }
  for (int i = 1; i < argc; ++i) {
    const int denominator = std::atoi(argv[i]);
    if (denominator < 2) continue;
    const std::uint64_t count = countCover(denominator);
    const std::uint64_t grid = static_cast<std::uint64_t>(std::lround(1.5 * denominator));
    const std::uint64_t available = grid * grid * grid;
    const double fraction = static_cast<double>(count) / available;
    std::cout << "1/" << denominator << "\t" << count << "\t" << available << "\t"
              << std::fixed << std::setprecision(6) << fraction * 100.0 << "%\t";
    if (denominator == 2) {
      std::cout << "baseline\n";
    } else {
      const double exponent = std::log(static_cast<double>(count) / 25.0) /
                              std::log(static_cast<double>(denominator) / 2.0);
      std::cout << std::setprecision(6) << exponent << "\n";
    }
  }
}
