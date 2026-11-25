#import "F4SourceTextRun.h"
#import <React/RCTFabricComponentsPlugins.h>
#import "F4SourceTextRunComponentDescriptor.h"
#import <react/renderer/components/F4SourceTextSpec/Props.h>
#import <react/renderer/components/F4SourceTextSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface F4SourceTextRun () <RCTF4SourceTextRunViewProtocol>

@end

@implementation F4SourceTextRun {
  NSString *_text;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<
      F4SourceTextRunComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps =
        std::make_shared<const F4SourceTextRunProps>();
    _props = defaultProps;
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props
           oldProps:(Props::Shared const &)oldProps {
  const auto &oldViewProps =
      *std::static_pointer_cast<F4SourceTextRunProps const>(_props);
  const auto &newViewProps =
      *std::static_pointer_cast<F4SourceTextRunProps const>(props);

  if (newViewProps.text != oldViewProps.text) {
    NSString *text = [NSString stringWithUTF8String:newViewProps.text.c_str()];
    _text = text;
  }

  [super updateProps:props oldProps:oldProps];
}

+ (BOOL)shouldBeRecycled {
  return NO;
}

Class<RCTComponentViewProtocol> F4SourceTextRunCls(void) {
  return F4SourceTextRun.class;
}

@end
