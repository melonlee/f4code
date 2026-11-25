#pragma once

#include <react/renderer/components/F4SourceTextSpec/EventEmitters.h>
#include <react/renderer/components/F4SourceTextSpec/Props.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>
#include <react/renderer/core/LayoutContext.h>
#include <react/renderer/core/ShadowNode.h>
#include <react/renderer/textlayoutmanager/TextLayoutManager.h>

namespace facebook::react {

extern const char F4SourceTextComponentName[];

class F4SourceTextStateReal final {
public:
  AttributedString attributedString;
};

class F4SourceTextShadowNode final
    : public ConcreteViewShadowNode<F4SourceTextComponentName,
                                    F4SourceTextProps, F4SourceTextEventEmitter,
                                    F4SourceTextStateReal> {
public:
  using ConcreteViewShadowNode::ConcreteViewShadowNode;

  F4SourceTextShadowNode(const ShadowNode &sourceShadowNode,
                         const ShadowNodeFragment &fragment);

  static ShadowNodeTraits BaseTraits() {
    auto traits = ConcreteViewShadowNode::BaseTraits();
    traits.set(ShadowNodeTraits::Trait::LeafYogaNode);
    traits.set(ShadowNodeTraits::Trait::MeasurableYogaNode);
    return traits;
  }

  void layout(LayoutContext layoutContext) override;

  Size
  measureContent(const LayoutContext &layoutContext,
                 const LayoutConstraints &layoutConstraints) const override;

private:
  mutable AttributedString _attributedString;
};
} // namespace facebook::react
