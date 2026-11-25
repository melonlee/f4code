Pod::Spec.new do |s|
  s.name = 'F4VoiceTranscription'
  s.version = '1.0.0'
  s.summary = 'Local recording conversion for F4code dictation.'
  s.author = 'F4 Tools'
  s.homepage = 'https://f4code.com'
  s.platform = :ios, '18.0'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
  s.frameworks = 'AudioToolbox'
end
