Pod::Spec.new do |s|
  s.name = 'F4WebSocket'
  s.version = '1.0.0'
  s.summary = 'WebSocket client with permessage-deflate for F4code mobile.'
  s.description = 'React Native ships SocketRocket on iOS, which never negotiates compression. This module dials the F4 server through URLSessionWebSocketTask, which offers permessage-deflate on its own.'
  s.author = 'F4 Tools'
  s.homepage = 'https://f4code.com'
  s.platform = :ios, '18.0'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end
