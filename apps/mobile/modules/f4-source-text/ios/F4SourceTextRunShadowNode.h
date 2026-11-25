#pragma once

#include <react/renderer/components/F4SourceTextSpec/EventEmitters.h>
#include <react/renderer/components/F4SourceTextSpec/Props.h>
#include <react/renderer/components/F4SourceTextSpec/States.h>
#include <react/renderer/components/view/ConcreteViewShadowNode.h>

namespace facebook::react {
extern const char F4SourceTextRunComponentName[];

using F4SourceTextRunShadowNode =
    ConcreteViewShadowNode<F4SourceTextRunComponentName, F4SourceTextRunProps,
                           F4SourceTextRunEventEmitter, F4SourceTextRunState>;
} // namespace facebook::react
