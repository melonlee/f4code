#include "F4SourceTextShadowNode.h"
#include "F4SourceTextRunShadowNode.h"
#include <react/renderer/components/view/ViewShadowNode.h>
#import <react/renderer/textlayoutmanager/RCTAttributedTextUtils.h>

#include <algorithm>
#include <cmath>

namespace facebook::react {

F4SourceTextShadowNode::F4SourceTextShadowNode(
    const ShadowNode &sourceShadowNode, const ShadowNodeFragment &fragment)
    : ConcreteViewShadowNode(sourceShadowNode, fragment){};

Size F4SourceTextShadowNode::measureContent(
    const LayoutContext &layoutContext,
    const LayoutConstraints &layoutConstraints) const {
  const auto &baseProps = getConcreteProps();

  auto baseTextAttributes = TextAttributes::defaultTextAttributes();
  baseTextAttributes.backgroundColor = baseProps.backgroundColor;
  baseTextAttributes.allowFontScaling = baseProps.allowFontScaling;

  Float fontSizeMultiplier = 1.0;
  if (baseTextAttributes.allowFontScaling) {
    fontSizeMultiplier = layoutContext.fontSizeMultiplier;
  }

  auto baseAttributedString = AttributedString{};
  const auto &children = getChildren();
  for (size_t i = 0; i < children.size(); i++) {
    const auto child = children[i].get();
    if (auto textViewChild =
            dynamic_cast<const F4SourceTextRunShadowNode *>(child)) {
      auto &props = textViewChild->getConcreteProps();
      auto fragment = AttributedString::Fragment{};
      auto textAttributes = TextAttributes::defaultTextAttributes();

      textAttributes.allowFontScaling = baseProps.allowFontScaling;
      textAttributes.backgroundColor = props.backgroundColor;
      textAttributes.fontSize = props.fontSize * fontSizeMultiplier;
      textAttributes.lineHeight = props.lineHeight * fontSizeMultiplier;
      textAttributes.foregroundColor = props.color;
      textAttributes.textShadowColor = props.shadowColor;
      textAttributes.textShadowOffset = props.shadowOffset;
      textAttributes.textShadowRadius = props.shadowRadius;
      textAttributes.letterSpacing = props.letterSpacing;
      textAttributes.textDecorationColor = props.textDecorationColor;
      textAttributes.fontFamily = props.fontFamily;

      if (props.fontStyle == F4SourceTextRunFontStyle::Italic) {
        textAttributes.fontStyle = FontStyle::Italic;
      } else {
        textAttributes.fontStyle = FontStyle::Normal;
      }

      if (props.fontWeight == F4SourceTextRunFontWeight::Bold) {
        textAttributes.fontWeight = FontWeight::Bold;
      } else if (props.fontWeight == F4SourceTextRunFontWeight::UltraLight) {
        textAttributes.fontWeight = FontWeight::UltraLight;
      } else if (props.fontWeight == F4SourceTextRunFontWeight::Light) {
        textAttributes.fontWeight = FontWeight::Light;
      } else if (props.fontWeight == F4SourceTextRunFontWeight::Medium) {
        textAttributes.fontWeight = FontWeight::Medium;
      } else if (props.fontWeight == F4SourceTextRunFontWeight::Semibold) {
        textAttributes.fontWeight = FontWeight::Semibold;
      } else if (props.fontWeight == F4SourceTextRunFontWeight::Heavy) {
        textAttributes.fontWeight = FontWeight::Heavy;
      } else {
        textAttributes.fontWeight = FontWeight::Regular;
      }

      if (props.textDecorationLine ==
          F4SourceTextRunTextDecorationLine::LineThrough) {
        textAttributes.textDecorationLineType =
            TextDecorationLineType::Strikethrough;
      } else if (props.textDecorationLine ==
                 F4SourceTextRunTextDecorationLine::Underline) {
        textAttributes.textDecorationLineType =
            TextDecorationLineType::Underline;
      } else {
        textAttributes.textDecorationLineType = TextDecorationLineType::None;
      }

      if (props.textDecorationStyle ==
          F4SourceTextRunTextDecorationStyle::Solid) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Solid;
      } else if (props.textDecorationStyle ==
                 F4SourceTextRunTextDecorationStyle::Dotted) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Dotted;
      } else if (props.textDecorationStyle ==
                 F4SourceTextRunTextDecorationStyle::Dashed) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Dashed;
      } else if (props.textDecorationStyle ==
                 F4SourceTextRunTextDecorationStyle::Double) {
        textAttributes.textDecorationStyle = TextDecorationStyle::Double;
      }

      if (props.textAlign == F4SourceTextRunTextAlign::Left) {
        textAttributes.alignment = TextAlignment::Left;
      } else if (props.textAlign == F4SourceTextRunTextAlign::Right) {
        textAttributes.alignment = TextAlignment::Right;
      } else if (props.textAlign == F4SourceTextRunTextAlign::Center) {
        textAttributes.alignment = TextAlignment::Center;
      } else if (props.textAlign == F4SourceTextRunTextAlign::Justify) {
        textAttributes.alignment = TextAlignment::Justified;
      } else if (props.textAlign == F4SourceTextRunTextAlign::Auto) {
        textAttributes.alignment = TextAlignment::Natural;
      }

      textAttributes.backgroundColor = props.backgroundColor;

      fragment.string = props.text;
      fragment.textAttributes = textAttributes;

      baseAttributedString.appendFragment(std::move(fragment));
    }
  }

  _attributedString = baseAttributedString;

  NSMutableAttributedString *convertedAttributedString =
      [RCTNSAttributedStringFromAttributedString(baseAttributedString)
          mutableCopy];
  // Match React Native's baseline offset in both measurement and rendering.
  RCTApplyBaselineOffset(convertedAttributedString);

  const CGFloat maximumWidth =
      std::isfinite(layoutConstraints.maximumSize.width)
          ? layoutConstraints.maximumSize.width
          : CGFLOAT_MAX;
  NSTextStorage *textStorage = [[NSTextStorage alloc]
      initWithAttributedString:convertedAttributedString];
  NSLayoutManager *layoutManager = [[NSLayoutManager alloc] init];
  layoutManager.usesFontLeading = NO;
  NSTextContainer *textContainer = [[NSTextContainer alloc]
      initWithSize:CGSizeMake(maximumWidth, CGFLOAT_MAX)];
  textContainer.lineFragmentPadding = 0;
  textContainer.maximumNumberOfLines = baseProps.numberOfLines;
  if (baseProps.ellipsizeMode == F4SourceTextEllipsizeMode::Head) {
    textContainer.lineBreakMode = NSLineBreakByTruncatingHead;
  } else if (baseProps.ellipsizeMode == F4SourceTextEllipsizeMode::Middle) {
    textContainer.lineBreakMode = NSLineBreakByTruncatingMiddle;
  } else if (baseProps.ellipsizeMode == F4SourceTextEllipsizeMode::Tail) {
    textContainer.lineBreakMode = NSLineBreakByTruncatingTail;
  } else {
    textContainer.lineBreakMode = NSLineBreakByClipping;
  }
  [layoutManager addTextContainer:textContainer];
  [textStorage addLayoutManager:layoutManager];
  [layoutManager ensureLayoutForTextContainer:textContainer];
  const CGRect usedRect =
      [layoutManager usedRectForTextContainer:textContainer];

  return {
      std::clamp(static_cast<Float>(std::ceil(usedRect.size.width)),
                 layoutConstraints.minimumSize.width,
                 layoutConstraints.maximumSize.width),
      std::clamp(static_cast<Float>(std::ceil(usedRect.size.height)),
                 layoutConstraints.minimumSize.height,
                 layoutConstraints.maximumSize.height),
  };
}

void F4SourceTextShadowNode::layout(LayoutContext layoutContext) {
  ensureUnsealed();
  setStateData(F4SourceTextStateReal{
      _attributedString,
  });
}
} // namespace facebook::react
