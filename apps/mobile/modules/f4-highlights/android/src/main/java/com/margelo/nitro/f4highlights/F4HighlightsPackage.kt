package com.margelo.nitro.f4highlights

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

// Autolinking instantiates this package, which loads the library that registers F4Highlights.
class F4HighlightsPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider { emptyMap() }

  companion object {
    init {
      f4highlightsOnLoad.initializeNative()
    }
  }
}
