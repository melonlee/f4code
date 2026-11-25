Pod::Spec.new do |s|
  s.name = 'F4PreviewTunnel'
  s.version = '1.0.0'
  s.summary = 'Webview whose localhost is another F4code environment.'
  s.description = "Loads an environment's loopback pages on the device through the server's preview tunnel, keeping their localhost origin."
  s.author = 'F4 Tools'
  s.homepage = 'https://f4code.com'
  s.platform = :ios, '18.0'
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'
end
