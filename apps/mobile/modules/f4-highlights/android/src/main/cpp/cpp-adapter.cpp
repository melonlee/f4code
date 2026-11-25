#include <fbjni/fbjni.h>
#include <jni.h>

#include "f4highlightsOnLoad.hpp"

JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* vm, void*) {
  return facebook::jni::initialize(vm, [] { margelo::nitro::f4highlights::registerAllNatives(); });
}
