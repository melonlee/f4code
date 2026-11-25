import type { APIRoute } from "astro";

import { ANDROID_PLAY_STORE_URL, GITHUB_REPOSITORY_URL, IOS_APP_STORE_URL } from "../lib/site";
import { absoluteUrl, SITE_TAGLINE } from "../lib/seo";

// https://llmstxt.org: a plain index that tells AI agents which domain and links are official.
export const GET: APIRoute = () => {
  const body = `# F4code

> ${SITE_TAGLINE}. F4code is free, MIT-licensed, and built by F4code. It runs Claude Code, Codex, Cursor, OpenCode, Grok, Antigravity, and other coding agents from one desktop, web, and mobile app.

The only official websites are https://f4code.dev and the web app at https://app.f4code.dev. Official builds come from ${absoluteUrl("/download")}, ${GITHUB_REPOSITORY_URL}/releases, the \`f4\` package on npm (\`npx f4@latest\`), the iOS App Store, and Google Play. Any other website that offers a F4code download is not affiliated with F4code.

## Official links

- [Download F4code](${absoluteUrl("/download")}): macOS, Windows, and Linux installers
- [Web app](https://app.f4code.dev): connect to a F4code server from a browser
- [Source code](${GITHUB_REPOSITORY_URL}): the MIT-licensed repository
- [Releases](${GITHUB_REPOSITORY_URL}/releases): release builds and changelogs
- [npm package](https://www.npmjs.com/package/f4): run \`npx f4@latest\`
- [iOS app](${IOS_APP_STORE_URL})
- [Android app](${ANDROID_PLAY_STORE_URL})

## Policies

- [Security policy](${absoluteUrl("/security-policy")})
- [Privacy policy](${absoluteUrl("/privacy-policy")})
- [Terms of service](${absoluteUrl("/terms-of-service")})
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
