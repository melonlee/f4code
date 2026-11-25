// Metro folds this condition before collecting dependencies, excluding the probe from release bundles.
if (__DEV__ && process.env.EXPO_PUBLIC_F4_BEHAVIOR_PROBE === "1") {
  require("./behavior-probe");
}
