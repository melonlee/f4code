# Network calls F4code makes

F4code sends no product analytics, crash reports, traces, Clerk auth beacons, Expo OTA pings, or
background upstream catalog/price fetches anywhere. Nothing leaves your machine except the traffic
you or your tools explicitly initiate:

- **Provider traffic**: your prompts, replies, and file context go to the model providers you
  configure (Anthropic, OpenAI, local servers, and so on), under their own privacy policies.
- **Explicit update / release lookups**: if you explicitly trigger a provider CLI update check or
  open the update-track dialog, F4code queries your configured npm registry.
- **Desktop app updates**: packaged builds from this fork embed no update feed; set
  `F4CODE_DISABLE_AUTO_UPDATE=1` to guarantee auto-update checks stay off even with a custom feed.

Diagnostics such as process CPU and memory history, server logs, and local crash logs stay on your
devices until you copy or share them yourself.
