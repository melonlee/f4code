# Encrypted remote control

Controlling F4code from another device sends your prompts, files and agent output over the
network. Two optional settings protect that traffic. Both are off by default, so nothing changes
until you turn them on, and the official F4code mobile app keeps working.

Both live in **Settings → Sharing & access**, in the section for the machine you are hosting from.

## Private transports only

Refuses remote connections that do not arrive over this machine, Tailscale or SSH. Tunnels
(Cloudflare, F4 Connect), public proxies and plain LAN addresses get a "not allowed" answer.
Turn it on and off from the same switch. A connection that is already open stays open.

## End-to-end encryption

Encrypts the session itself, so a tunnel or an untrusted network only sees opaque data. The
client also checks the host's identity, so someone in the middle cannot pose as your host.

### Turn it on

![The End-to-end encryption switch in Settings → Sharing & access](../../pics/e2ee-sharing-access.png)

1. On the host, open **Settings → Sharing & access** and switch on **End-to-end encryption**.
   The row shows the host's fingerprint, for example `AB12-CD34-EF56-7890`.
2. Still on the host, press **Create link** and pair each device from that link (or its QR code).
   Links made while the setting is on carry the host's key, and the device saves it.
3. Connect as usual. A device that saved the key encrypts the whole session and refuses a host
   that presents a different key.

### Good to know

- **Devices have to pair again.** Devices paired before you turned it on stay unencrypted.
  They keep working because the setting only asks for encryption, it does not demand it.
- **Use Create link.** Links from `f4 pair` and the headless startup URL do not carry the key
  yet, so a device paired that way is not encrypted.
- **It cannot fail open.** A device with a saved key either encrypts or does not connect. If you
  see "identity changed", the host's key changed. Re-pair only if you expected that, for
  example after reinstalling the host.
- **Turning it off.** Flip the same switch. Devices that saved the key stop connecting until
  you pair them again, and the app warns you about this.
- **Require it.** To also refuse devices that do not encrypt, set `"e2eeMode": "require"` in the
  host's `settings.json`. The official F4code mobile app cannot connect then.
- **New key.** Stop the host, delete the `e2ee-identity-seed-v1` secret, start it again and
  re-pair every device.
- **Not covered.** Only the live session is encrypted. File and image uploads and downloads
  rely on the connection itself, so use **Private transports only** with it if they matter.

## Which one do I want?

| Situation | Use |
| --- | --- |
| Only your own devices over Tailscale or SSH | **Private transports only** is enough. |
| Reaching the host through a tunnel or an untrusted network | **End-to-end encryption**, paired from a fresh link. |
| Both | Turn both on. Tunnels are then refused, and the rest is encrypted. |
