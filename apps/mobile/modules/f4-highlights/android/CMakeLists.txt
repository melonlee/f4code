cmake_minimum_required(VERSION 3.22.1)

project(f4highlights LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(F4_HIGHLIGHTS_ROOT "${CMAKE_SOURCE_DIR}/..")

add_library(
  f4highlights SHARED
  src/main/cpp/cpp-adapter.cpp
  "${F4_HIGHLIGHTS_ROOT}/cpp/HybridF4Highlights.cpp"
  "${F4_HIGHLIGHTS_ROOT}/cpp/Utf16ToUtf8.cpp"
  "${F4_HIGHLIGHTS_ROOT}/cpp/f4_highlights.c"
  "${F4_HIGHLIGHTS_ROOT}/Vendor/highlights/highlights.c"
  "${F4_HIGHLIGHTS_ROOT}/Vendor/wasm2c/wasm-rt-impl.c"
  "${F4_HIGHLIGHTS_ROOT}/Vendor/wasm2c/wasm-rt-mem-impl.c"
)

include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/f4highlights+autolinking.cmake)

target_include_directories(
  f4highlights
  PRIVATE "${F4_HIGHLIGHTS_ROOT}/cpp" "${F4_HIGHLIGHTS_ROOT}/Vendor"
          "${F4_HIGHLIGHTS_ROOT}/Vendor/highlights" "${F4_HIGHLIGHTS_ROOT}/Vendor/wasm2c"
)

# Plain malloc memory with explicit bounds checks: no guard-page signal
# handlers competing with ART's.
target_compile_definitions(
  f4highlights PRIVATE WASM_RT_USE_MMAP=0 WASM_RT_MEMCHECK_BOUNDS_CHECK=1
                       WASM_RT_SKIP_SIGNAL_RECOVERY=1
)

# The lexers are generated code; keep them fast in debug builds too.
target_compile_options(f4highlights PRIVATE -O2)

target_link_options(
  f4highlights PRIVATE "-Wl,-z,common-page-size=16384" "-Wl,-z,max-page-size=16384"
)
