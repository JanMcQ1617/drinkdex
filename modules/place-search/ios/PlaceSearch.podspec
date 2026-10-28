# Sipply's one local native module (specs/v4.8-places/spec.md §1). Expo
# autolinking finds it in ./modules without a package.json (it names the
# pod's dependency after the folder, "place-search"), so the fields a
# node module's podspec reads from package.json are written out here.
# The keys match the installed expo-haptics and expo-apple-authentication:
# Swift 5.9 beside ExpoModulesCore's 6.0 (spec §1.3 says why), a static
# framework, and whole-module compilation.
Pod::Spec.new do |s|
  s.name           = 'PlaceSearch'
  s.version        = '1.0.0'
  s.summary        = 'Sipply: venue search with MapKit, and an optional coarse location fix'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'The Idealize'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MapKit', 'CoreLocation'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
