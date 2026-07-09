# Force edge http→https upgrade (ADR-0004): in-app webviews (Instagram, etc.) carry no cached HSTS, so without this they boot the SPA on http:// and every request fails the backends' https-only CORS + return_to allow-lists.
resource "cloudflare_zone_setting" "always_use_https" {
  # Same bootstrap gate as the rest of the zone IaC: no zone yet = no-op apply.
  count = var.custom_domain == "" || var.cloudflare_zone_id == "" ? 0 : 1

  zone_id    = var.cloudflare_zone_id
  setting_id = "always_use_https"
  value      = "on"
}
