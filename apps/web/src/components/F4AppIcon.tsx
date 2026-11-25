// The production icon, as GitHub shows the F4code app, whatever this build's channel.
import appIconUrl from "../../../../assets/prod/f4-black-web-apple-touch-180.png";

export function F4AppIcon(props: { readonly className?: string }) {
  return <img src={appIconUrl} alt="" className={props.className} />;
}
