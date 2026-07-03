# Edge cache rules for the API hosts — policy and rollout in ADR-0089 §3–4.
resource "cloudflare_ruleset" "api_cache_rules" {
  # Same bootstrap gate as the rest of the zone IaC: no zone yet = no-op apply.
  count = var.custom_domain == "" || var.cloudflare_zone_id == "" ? 0 : 1

  zone_id     = var.cloudflare_zone_id
  name        = "API edge cache rules"
  description = "Edge caching for the grid daily endpoint (ADR-0089)"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      ref = "grid_daily_anonymous_edge_cache"
      # Cookie-bearing requests embed a per-user hint budget; they fall through to zone defaults (uncached).
      description = "Cache the anonymous grid daily puzzle at the edge (ADR-0089)"
      expression  = "(http.host eq \"api.${var.custom_domain}\" and http.request.uri.path eq \"/v1/puzzles/daily\" and not http.cookie contains \"__Secure-ws_session\")"
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        # Honor the origin's s-maxage (until UTC midnight); default cache key keeps ?date= variants distinct.
        edge_ttl = {
          mode = "respect_origin"
        }
      }
    }
  ]
}
