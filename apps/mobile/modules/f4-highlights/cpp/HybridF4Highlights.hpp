#pragma once

#include "HybridF4HighlightsSpec.hpp"

namespace margelo::nitro::f4highlights {

class HybridF4Highlights : public HybridF4HighlightsSpec {
public:
  HybridF4Highlights() : HybridObject(TAG) {}

  std::optional<std::shared_ptr<ArrayBuffer>> tokenize(SourceText source,
                                                       double language) override;
};

} // namespace margelo::nitro::f4highlights
