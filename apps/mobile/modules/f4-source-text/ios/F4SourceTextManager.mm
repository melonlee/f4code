#import <React/RCTUIManager.h>
#import <React/RCTViewManager.h>

@interface F4SourceTextManager : RCTViewManager
@end

@implementation F4SourceTextManager

RCT_EXPORT_MODULE(F4SourceText)

- (UIView *)view {
  return [[UIView alloc] init];
}

@end

@interface F4SourceTextRunManager : RCTViewManager
@end

@implementation F4SourceTextRunManager

RCT_EXPORT_MODULE(F4SourceTextRun)

- (UIView *)view {
  return nil;
}

@end
