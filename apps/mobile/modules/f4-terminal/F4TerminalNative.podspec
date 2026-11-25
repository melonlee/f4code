require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'F4TerminalNative'
  s.version = package['version']
  s.summary = 'Native terminal surface for F4code mobile.'
  s.description = 'Native terminal surface bridge used by the F4code React Native app.'
  s.homepage = 'https://f4code.com'
  s.license = { :type => 'UNLICENSED' }
  s.author = { 'F4 Tools' => 'hello@f4code.com' }
  s.platforms = { :ios => '16.1' }
  s.source = { :path => '.' }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.vendored_frameworks = 'Vendor/libghostty/GhosttyKit.xcframework'
  # libghostty has no x86_64 simulator slice, so a simulator build for every
  # architecture (EAS's generic destination) fails to resolve GhosttyKit.
  s.pod_target_xcconfig = { 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'x86_64' }
  s.user_target_xcconfig = { 'EXCLUDED_ARCHS[sdk=iphonesimulator*]' => 'x86_64' }
  s.frameworks = 'IOSurface', 'Metal', 'MetalKit', 'QuartzCore', 'UIKit'
  s.libraries = 'c++', 'z'
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
end
